import SwiftUI

enum Tab: Hashable {
    case library, lists, equalizer, settings
}

enum SmartList: String, CaseIterable, Identifiable, Hashable {
    case recent, top, played
    var id: String { rawValue }
    var title: String {
        switch self {
        case .recent: return "Agregadas recientemente"
        case .top: return "Más reproducidas"
        case .played: return "Reproducidas recientemente"
        }
    }
    var icon: String {
        switch self {
        case .recent: return "sparkles"
        case .top: return "chart.line.uptrend.xyaxis"
        case .played: return "clock.arrow.circlepath"
        }
    }
}

enum Route: Hashable {
    case album(String)
    case artist(String)
    case genre(String)
    case folder(String)
    case playlist(UUID)
    case smart(SmartList)
    case favorites
}

struct TrackBatch: Identifiable {
    let id = UUID()
    let tracks: [Track]
}

struct SharePayload: Identifiable {
    let id = UUID()
    let urls: [URL]
}

/// Navegación, avisos y hojas compartidas por toda la app.
@MainActor
final class Router: ObservableObject {
    static let shared = Router()

    @Published var tab: Tab = .library
    @Published var libraryPath = NavigationPath()
    @Published var listsPath = NavigationPath()
    @Published var showNowPlaying = false
    @Published var toast: String?
    @Published var addToPlaylist: TrackBatch?
    @Published var sharePayload: SharePayload?
    @Published var confirmDelete: Track?
    @Published var preparingShare = false

    func go(_ route: Route) {
        showNowPlaying = false
        switch route {
        case .playlist, .smart, .favorites:
            tab = .lists
            listsPath.append(route)
        default:
            tab = .library
            libraryPath.append(route)
        }
    }

    func show(_ message: String) {
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if toast == message { withAnimation { toast = nil } }
        }
    }

    /// Prepara los archivos y abre la hoja «Compartir» de iOS (WhatsApp, AirDrop, Mensajes, Archivos…).
    func share(_ tracks: [Track]) {
        guard !tracks.isEmpty, !preparingShare else { return }
        preparingShare = true
        Task {
            let urls = await Sharing.prepare(tracks)
            preparingShare = false
            if urls.isEmpty {
                show("No se pudo preparar el archivo para compartir")
            } else {
                sharePayload = SharePayload(urls: urls)
            }
        }
    }
}
