import AVFoundation
import Foundation
import MediaPlayer
import SwiftUI
import UIKit

enum RepeatMode: String, Codable {
    case off, all, one
}

/// Cola, aleatorio, repetición, temporizador, estadísticas, pantalla bloqueada y reanudación.
@MainActor
final class PlayerController: ObservableObject {
    static let shared = PlayerController()

    @Published private(set) var queue: [String] = []
    @Published private(set) var index = -1
    @Published private(set) var isPlaying = false
    @Published private(set) var position: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var shuffle = false
    @Published private(set) var repeatMode: RepeatMode = .off
    @Published private(set) var sleepEndsAt: Date?
    @Published private(set) var sleepEndOfTrack = false

    private var original: [String]?
    private let engine = AudioEngine.shared
    private var counted = false
    private var errorStreak = 0
    private var timer: Timer?
    private var lastSave = Date.distantPast
    private let file = "cola.json"

    private struct Saved: Codable {
        var queue: [String]
        var original: [String]?
        var index: Int
        var position: Double
        var shuffle: Bool
        var repeatMode: RepeatMode
    }

    private init() {
        engine.onEnded = { [weak self] in self?.trackEnded() }
        engine.onInterruption = { [weak self] began, resume in
            guard let self else { return }
            if began {
                self.isPlaying = false
                self.updateNowPlaying()
            } else if resume {
                self.play()
            }
        }
        engine.onRouteChange = { [weak self] deviceGone in
            guard let self else { return }
            if deviceGone && self.isPlaying { self.pause() }
            EqualizerStore.shared.refreshOutput(announce: true)
        }
        setupRemoteCommands()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    var currentId: String? { index >= 0 && index < queue.count ? queue[index] : nil }
    var current: Track? { currentId.flatMap { LibraryStore.shared.track($0) } }
    var sleepActive: Bool { sleepEndsAt != nil || sleepEndOfTrack }

    // MARK: Acciones

    func play(_ tracks: [Track], start: Int = 0, shuffled: Bool? = nil) {
        guard !tracks.isEmpty else { return }
        let ids = tracks.map(\.id)
        let useShuffle = shuffled ?? shuffle
        errorStreak = 0
        if useShuffle {
            let first = (shuffled == true && start == 0) ? Int.random(in: 0..<ids.count) : min(start, ids.count - 1)
            var rest = ids
            rest.remove(at: first)
            queue = [ids[first]] + rest.shuffled()
            original = ids
            shuffle = true
            load(0, autoplay: true)
        } else {
            queue = ids
            original = nil
            shuffle = false
            load(min(start, ids.count - 1), autoplay: true)
        }
    }

    func playNext(_ tracks: [Track]) {
        guard !tracks.isEmpty else { return }
        guard index >= 0 else { return play(tracks) }
        let ids = tracks.map(\.id)
        queue.insert(contentsOf: ids, at: index + 1)
        original?.append(contentsOf: ids)
        saveState()
        Router.shared.show(tracks.count == 1 ? "«\(tracks[0].title)» sonará a continuación" : "\(tracks.count) canciones sonarán a continuación")
    }

    func addToQueue(_ tracks: [Track]) {
        guard !tracks.isEmpty else { return }
        guard index >= 0 else { return play(tracks) }
        let ids = tracks.map(\.id)
        queue.append(contentsOf: ids)
        original?.append(contentsOf: ids)
        saveState()
        Router.shared.show(tracks.count == 1 ? "«\(tracks[0].title)» agregada a la cola" : "\(tracks.count) canciones agregadas a la cola")
    }

    func togglePlay() {
        isPlaying ? pause() : play()
    }

    func play() {
        if index < 0 {
            if !queue.isEmpty { load(0, autoplay: true) } else { play(LibraryStore.shared.tracks) }
            return
        }
        if engine.duration == 0 {
            load(index, autoplay: true, at: position)
            return
        }
        do {
            try engine.play()
            isPlaying = true
        } catch {
            pipoLog.error("No se pudo reanudar: \(error.localizedDescription, privacy: .public)")
        }
        updateNowPlaying()
    }

    func pause() {
        engine.pause()
        isPlaying = false
        position = engine.currentTime
        updateNowPlaying()
        saveState()
    }

    func next(auto: Bool = false) {
        guard !queue.isEmpty else { return }
        var i = index + 1
        if i >= queue.count {
            if repeatMode == .all || !auto {
                i = 0
            } else {
                isPlaying = false
                engine.seek(to: 0)
                position = 0
                updateNowPlaying()
                return
            }
        }
        load(i, autoplay: true)
    }

    func previous() {
        guard !queue.isEmpty else { return }
        if engine.currentTime > 3 {
            seek(to: 0)
            return
        }
        var i = index - 1
        if i < 0 { i = repeatMode == .all ? queue.count - 1 : 0 }
        load(i, autoplay: true)
    }

    func jump(to i: Int) {
        errorStreak = 0
        load(i, autoplay: true)
    }

    func seek(to seconds: Double) {
        if engine.duration == 0 {
            position = seconds
            return
        }
        engine.seek(to: seconds)
        position = seconds
        updateNowPlaying()
    }

    func toggleShuffle() {
        let cur = currentId
        if !shuffle {
            var rest = queue
            if index >= 0 { rest.remove(at: index) }
            original = queue
            queue = (cur.map { [$0] } ?? []) + rest.shuffled()
            index = cur == nil ? -1 : 0
            shuffle = true
            Router.shared.show("Aleatorio activado")
        } else {
            let base = original ?? queue
            let extra = queue.filter { !base.contains($0) }
            queue = base.filter { queue.contains($0) } + extra
            index = cur.flatMap { queue.firstIndex(of: $0) } ?? -1
            original = nil
            shuffle = false
            Router.shared.show("Aleatorio desactivado")
        }
        saveState()
    }

    func cycleRepeat() {
        switch repeatMode {
        case .off: repeatMode = .all; Router.shared.show("Repetir toda la cola")
        case .all: repeatMode = .one; Router.shared.show("Repetir esta canción")
        case .one: repeatMode = .off; Router.shared.show("Repetir desactivado")
        }
        saveState()
    }

    func move(from source: IndexSet, to destination: Int) {
        let cur = currentId
        queue.move(fromOffsets: source, toOffset: destination)
        if let cur, let i = queue.firstIndex(of: cur) { index = i }
        saveState()
    }

    func remove(at offsets: IndexSet) {
        let removingCurrent = offsets.contains(index)
        let cur = currentId
        queue.remove(atOffsets: offsets)
        if queue.isEmpty { return clear() }
        if removingCurrent {
            load(min(offsets.first ?? 0, queue.count - 1), autoplay: isPlaying)
        } else if let cur, let i = queue.firstIndex(of: cur) {
            index = i
        }
        saveState()
    }

    func clear() {
        engine.stop()
        queue = []
        original = nil
        index = -1
        isPlaying = false
        position = 0
        duration = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        saveState()
    }

    func setSleepTimer(minutes: Int?) {
        engine.fadeVolume = 1
        if let minutes {
            sleepEndsAt = Date().addingTimeInterval(TimeInterval(minutes * 60))
            sleepEndOfTrack = false
            Router.shared.show("La música se detendrá en \(minutes) min")
        } else {
            sleepEndsAt = nil
            sleepEndOfTrack = false
            Router.shared.show("Temporizador cancelado")
        }
    }

    func setSleepAtEndOfTrack() {
        engine.fadeVolume = 1
        sleepEndsAt = nil
        sleepEndOfTrack = true
        Router.shared.show("La música se detendrá al terminar esta canción")
    }

    // MARK: Carga

    private func load(_ i: Int, autoplay: Bool, at start: Double = 0) {
        guard i >= 0, i < queue.count else { return }
        index = i
        counted = false
        guard let track = LibraryStore.shared.track(queue[i]), let url = LibraryStore.shared.playableURL(for: track) else {
            return loadFailed(nil)
        }
        position = start
        duration = track.duration
        do {
            try engine.load(url: url, at: start)
            if engine.duration > 0 { duration = engine.duration }
            if autoplay {
                try engine.play()
                isPlaying = true
            } else {
                isPlaying = false
            }
            errorStreak = 0
            pipoLog.info("Reproduciendo «\(track.title, privacy: .public)»")
        } catch {
            pipoLog.error("No se pudo abrir \(track.title, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return loadFailed(track)
        }
        updateNowPlaying()
        saveState()
    }

    private func loadFailed(_ track: Track?) {
        errorStreak += 1
        Router.shared.show("No se pudo reproducir «\(track?.title ?? "la canción")»")
        if errorStreak < min(5, queue.count), index + 1 < queue.count {
            load(index + 1, autoplay: true)
        } else {
            isPlaying = false
        }
    }

    private func trackEnded() {
        if sleepEndOfTrack {
            stopForSleep()
            return
        }
        if repeatMode == .one {
            engine.seek(to: 0)
            try? engine.play()
            counted = false
            return
        }
        next(auto: true)
    }

    private func stopForSleep() {
        engine.pause()
        engine.fadeVolume = 1
        isPlaying = false
        sleepEndsAt = nil
        sleepEndOfTrack = false
        updateNowPlaying()
        Router.shared.show("Temporizador: música detenida")
    }

    private func tick() {
        guard index >= 0 else { return }
        if isPlaying {
            position = engine.currentTime
            if !counted, let t = current, duration > 0, position >= min(30, duration / 2) {
                counted = true
                UserDataStore.shared.countPlay(t)
            }
            if Date().timeIntervalSince(lastSave) > 5 { saveState() }
        }
        if let ends = sleepEndsAt {
            let left = ends.timeIntervalSinceNow
            if left <= 0 {
                stopForSleep()
            } else if left < 10 && isPlaying {
                engine.fadeVolume = Float(left / 10)
            }
        }
    }

    // MARK: Guardar y recuperar

    func saveState() {
        lastSave = Date()
        let pos = engine.duration > 0 ? engine.currentTime : position
        Storage.save(Saved(queue: queue, original: original, index: index, position: pos, shuffle: shuffle, repeatMode: repeatMode), to: file)
    }

    /// Recupera la cola, la canción y la posición de la última vez (sin empezar a sonar).
    func restore() {
        guard let s = Storage.load(Saved.self, from: file), !s.queue.isEmpty else { return }
        let lib = LibraryStore.shared
        let valid = s.queue.filter { lib.track($0) != nil }
        guard !valid.isEmpty else { return }
        let curId = s.index >= 0 && s.index < s.queue.count ? s.queue[s.index] : nil
        queue = valid
        original = s.original?.filter { lib.track($0) != nil }
        shuffle = s.shuffle
        repeatMode = s.repeatMode
        index = curId.flatMap { valid.firstIndex(of: $0) } ?? 0
        position = curId == queue[index] ? s.position : 0
        duration = current?.duration ?? 0
        updateNowPlaying()
    }

    // MARK: Pantalla bloqueada y Centro de control

    private func setupRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }
        c.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlay() }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.next() }
            return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.previous() }
            return .success
        }
        c.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let time = e.positionTime
            Task { @MainActor in self?.seek(to: time) }
            return .success
        }
    }

    func updateNowPlaying() {
        guard let t = current else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title,
            MPMediaItemPropertyArtist: t.displayArtist,
            MPMediaItemPropertyAlbumTitle: t.album,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let img = ArtCache.image(t.artKey) {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
