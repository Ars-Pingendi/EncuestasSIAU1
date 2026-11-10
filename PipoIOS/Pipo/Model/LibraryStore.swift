import Foundation
import MediaPlayer
import os

let pipoLog = Logger(subsystem: "com.personal.pipomusicplayer", category: "pipo")

/// Biblioteca: archivos dentro de Pipo + (opcional) canciones de la app Música, con sus agrupaciones.
@MainActor
final class LibraryStore: ObservableObject {
    static let shared = LibraryStore()

    @Published private(set) var tracks: [Track] = []
    @Published private(set) var albums: [Album] = []
    @Published private(set) var artists: [Artist] = []
    @Published private(set) var genres: [TrackGroup] = []
    @Published private(set) var folders: [TrackGroup] = []
    @Published private(set) var scanning = false
    @Published private(set) var loaded = false
    @Published var includeMusicLibrary: Bool = UserDefaults.standard.bool(forKey: "usarMusicaDelIphone") {
        didSet {
            UserDefaults.standard.set(includeMusicLibrary, forKey: "usarMusicaDelIphone")
            Task { await scan() }
        }
    }

    private(set) var byId: [String: Track] = [:]
    private(set) var albumByKey: [String: Album] = [:]
    private(set) var artistByKey: [String: Artist] = [:]
    private var cache: [String: LibraryScanner.CacheEntry] = [:]
    private var libraryURLs: [UInt64: URL] = [:]
    private var rescanPending = false
    private let cacheFile = "biblioteca.json"

    private init() {
        cache = Storage.load([String: LibraryScanner.CacheEntry].self, from: cacheFile) ?? [:]
        // Muestra de inmediato lo que había la última vez; el escaneo actualiza después.
        apply(cache.values.map(\.track))
    }

    func track(_ id: String) -> Track? { byId[id] }

    func tracks(_ ids: [String]) -> [Track] { ids.compactMap { byId[$0] } }

    func playableURL(for track: Track) -> URL? {
        switch track.source {
        case .file: return track.fileURL
        case .library:
            if let url = libraryURLs[track.persistentID] { return url }
            let query = MPMediaQuery.songs()
            query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: track.persistentID), forProperty: MPMediaItemPropertyPersistentID))
            return query.items?.first?.assetURL
        }
    }

    /// Busca música nueva o cambiada (rápido: solo lee los archivos que cambiaron).
    func scan() async {
        if scanning {
            rescanPending = true
            return
        }
        scanning = true
        let previous = cache
        let useLibrary = includeMusicLibrary
        let result = await Task.detached(priority: .utility) { () -> ([String: LibraryScanner.CacheEntry], [Track], [UInt64: URL]) in
            var fresh: [String: LibraryScanner.CacheEntry] = [:]
            for f in LibraryScanner.listAudioFiles(in: AppPaths.documents) {
                if let old = previous[f.relativePath], old.size == f.size, abs(old.modified.timeIntervalSince(f.modified)) < 1 {
                    fresh[f.relativePath] = old
                    continue
                }
                let meta = await LibraryScanner.readMetadata(f.url)
                let track = LibraryScanner.makeTrack(f, meta, addedAt: previous[f.relativePath]?.track.addedAt)
                fresh[f.relativePath] = LibraryScanner.CacheEntry(size: f.size, modified: f.modified, track: track)
            }
            let lib: (tracks: [Track], urls: [UInt64: URL]) = useLibrary ? LibraryScanner.musicLibraryTracks() : (tracks: [], urls: [:])
            return (fresh, lib.tracks, lib.urls)
        }.value
        cache = result.0
        libraryURLs = result.2
        Storage.save(cache, to: cacheFile)
        apply(cache.values.map(\.track) + result.1)
        loaded = true
        scanning = false
        pipoLog.info("Biblioteca: \(self.tracks.count, privacy: .public) canciones")
        if rescanPending {
            rescanPending = false
            await scan()
        }
    }

    func importFiles(_ urls: [URL], announce: Bool = true) async {
        let count = await Task.detached(priority: .userInitiated) { LibraryScanner.copyIntoLibrary(urls) }.value
        await scan()
        if announce {
            Router.shared.show(count == 0 ? "No se agregaron canciones nuevas" : plural(count, "canción agregada", "canciones agregadas"))
        }
    }

    func deleteFile(_ track: Track) async {
        guard let url = track.fileURL else { return }
        try? FileManager.default.removeItem(at: url)
        await scan()
        Router.shared.show("Canción eliminada del iPhone")
    }

    func requestMusicLibrary() {
        MPMediaLibrary.requestAuthorization { status in
            Task { @MainActor in
                if status == .authorized {
                    self.includeMusicLibrary = true
                } else {
                    self.includeMusicLibrary = false
                    Router.shared.show("Permite el acceso en Ajustes del iPhone › Pipo › Contenido multimedia")
                }
            }
        }
    }

    // MARK: Agrupaciones

    private func apply(_ all: [Track]) {
        let sorted = all.sorted { $0.title.before($1.title) }
        tracks = sorted
        byId = Dictionary(sorted.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

        var albumMap: [String: [Track]] = [:]
        for t in sorted { albumMap[t.albumKey, default: []].append(t) }
        let builtAlbums: [Album] = albumMap.map { key, list in
            let ordered = list.sorted { a, b in
                if a.discNo != b.discNo { return a.discNo < b.discNo }
                if a.trackNo != b.trackNo { return a.trackNo < b.trackNo }
                return a.title.before(b.title)
            }
            let first = ordered[0]
            var counts: [String: Int] = [:]
            for t in ordered { counts[t.displayArtist, default: 0] += 1 }
            let artist = !first.albumArtist.isEmpty ? first.albumArtist
                : (counts.count > 2 ? "Varios artistas" : (counts.max { $0.value < $1.value }?.key ?? unknownArtist))
            return Album(
                key: key,
                title: first.album,
                artist: artist,
                year: ordered.map(\.year).max() ?? 0,
                artKey: ordered.first { $0.artKey != nil }?.artKey,
                tracks: ordered
            )
        }.sorted { $0.title.before($1.title) }
        albums = builtAlbums
        albumByKey = Dictionary(builtAlbums.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })

        var artistTracks: [String: [Track]] = [:]
        var artistNames: [String: String] = [:]
        for t in sorted {
            artistTracks[t.artistKey, default: []].append(t)
            if artistNames[t.artistKey] == nil { artistNames[t.artistKey] = t.displayArtist }
        }
        let builtArtists: [Artist] = artistTracks.map { key, list in
            let albumKeys = Set(list.map(\.albumKey))
            let artistAlbums = builtAlbums.filter { albumKeys.contains($0.key) }
            return Artist(
                key: key,
                name: artistNames[key] ?? unknownArtist,
                tracks: list.sorted { a, b in a.album == b.album ? a.trackNo < b.trackNo : a.album.before(b.album) },
                albums: artistAlbums,
                artKey: list.first { $0.artKey != nil }?.artKey
            )
        }.sorted { $0.name.before($1.name) }
        artists = builtArtists
        artistByKey = Dictionary(builtArtists.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })

        var genreMap: [String: [Track]] = [:]
        for t in sorted { genreMap[(t.genre.isEmpty ? unknownGenre : t.genre).lowercased(), default: []].append(t) }
        genres = genreMap.map { key, list in
            TrackGroup(key: key, name: list[0].genre.isEmpty ? unknownGenre : list[0].genre,
                       subtitle: plural(list.count, "canción", "canciones"), tracks: list,
                       artKey: list.first { $0.artKey != nil }?.artKey)
        }.sorted { $0.name.before($1.name) }

        var folderMap: [String: [Track]] = [:]
        for t in sorted { folderMap[t.folder, default: []].append(t) }
        folders = folderMap.map { key, list in
            let name = key.isEmpty ? "Pipo" : (key as NSString).lastPathComponent
            let ordered = list.sorted { ($0.relativePath as NSString).lastPathComponent.before(($1.relativePath as NSString).lastPathComponent) }
            return TrackGroup(key: key, name: name, subtitle: key.isEmpty ? "Carpeta principal" : key,
                              tracks: ordered, artKey: list.first { $0.artKey != nil }?.artKey)
        }.sorted { $0.name.before($1.name) }
    }

    func sortedTracks(_ list: [Track], by sort: SongSort) -> [Track] {
        switch sort {
        case .title: return list.sorted { $0.title.before($1.title) }
        case .artist: return list.sorted { a, b in a.displayArtist == b.displayArtist ? a.album.before(b.album) : a.displayArtist.before(b.displayArtist) }
        case .album: return list.sorted { a, b in a.album == b.album ? a.trackNo < b.trackNo : a.album.before(b.album) }
        case .recent: return list.sorted { $0.addedAt > $1.addedAt }
        case .duration: return list.sorted { $0.duration > $1.duration }
        }
    }
}
