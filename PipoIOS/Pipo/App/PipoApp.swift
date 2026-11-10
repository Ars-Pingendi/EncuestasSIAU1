import SwiftUI

@main
struct PipoApp: App {
    @StateObject private var library = LibraryStore.shared
    @StateObject private var userData = UserDataStore.shared
    @StateObject private var player = PlayerController.shared
    @StateObject private var eq = EqualizerStore.shared
    @StateObject private var router = Router.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = false

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(userData)
                .environmentObject(player)
                .environmentObject(eq)
                .environmentObject(router)
                .tint(Theme.accent)
                .task {
                    guard !started else { return }
                    started = true
                    eq.start()
                    await library.scan()
                    player.restore()
                    await DebugLaunch.apply()
                }
                .onOpenURL { url in
                    // «Abrir con Pipo» desde Archivos, WhatsApp, Mail, AirDrop…
                    Task { await library.importFiles([url]) }
                }
        }
        .onChange(of: scenePhase) { phase in
            switch phase {
            case .active:
                if started { Task { await library.scan() } }
            case .background:
                player.saveState()
            default:
                break
            }
        }
    }
}

/// Opciones de arranque usadas por las pruebas automáticas (capturas en el simulador).
enum DebugLaunch {
    @MainActor
    static func apply() async {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains(where: { $0.hasPrefix("-pipo") }) else { return }
        func value(_ key: String) -> String? {
            guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        let router = Router.shared, library = LibraryStore.shared, player = PlayerController.shared
        let userData = UserDataStore.shared, eq = EqualizerStore.shared

        if args.contains("-pipoDemo") {
            if userData.playlists.isEmpty {
                let picks = stride(from: 0, to: library.tracks.count, by: 2).prefix(6).map { library.tracks[$0] }
                userData.createPlaylist("Para el carro", tracks: Array(picks))
            }
            for t in library.tracks.prefix(3) where !userData.isFavorite(t.id) { userData.toggleFavorite(t) }
        }
        if let preset = value("-pipoPreset") {
            eq.applyPreset(preset)
            var s = eq.settings
            s.bass = 35
            s.width = 20
            eq.settings = s
        }
        if args.contains("-pipoPlay"), !library.tracks.isEmpty {
            player.play(library.tracks, start: min(1, library.tracks.count - 1), shuffled: false)
        }
        if let tab = value("-pipoTab") {
            switch tab {
            case "lists": router.tab = .lists
            case "equalizer": router.tab = .equalizer
            case "settings": router.tab = .settings
            default: router.tab = .library
            }
        }
        if let route = value("-pipoRoute") {
            switch route {
            case "album": if let a = library.albums.first(where: { $0.artKey != nil }) ?? library.albums.first { router.go(.album(a.key)) }
            case "artist": if let a = library.artists.first { router.go(.artist(a.key)) }
            case "playlist": if let p = userData.playlists.first { router.go(.playlist(p.id)) }
            case "favorites": router.go(.favorites)
            default: break
            }
        }
        if args.contains("-pipoNowPlaying") { router.showNowPlaying = true }
        if args.contains("-pipoShare"), let t = library.tracks.first {
            try? await Task.sleep(nanoseconds: 800_000_000)
            router.share([t])
        }
        if args.contains("-pipoSelfTest") {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            let report: [String: Any] = [
                "canciones": library.tracks.count,
                "albumes": library.albums.count,
                "artistas": library.artists.count,
                "generos": library.genres.count,
                "carpetas": library.folders.count,
                "sonando": player.isPlaying,
                "posicion": player.position,
                "duracion": player.duration,
                "cancion": player.current?.title ?? "",
                "salida": eq.outputName,
                "preajuste": eq.settings.preset ?? "personalizado",
            ]
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
                try? data.write(to: AppPaths.documents.appendingPathComponent(".prueba.json"))
            }
        }
    }
}
