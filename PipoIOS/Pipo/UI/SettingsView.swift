import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var router: Router
    @State private var importing = false
    @State private var confirmClear = false

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    var body: some View {
        Form {
            Section {
                Button { importing = true } label: { Label("Importar canciones o carpetas", systemImage: "square.and.arrow.down") }
                Toggle(isOn: Binding(
                    get: { library.includeMusicLibrary },
                    set: { on in
                        if on { library.requestMusicLibrary() } else { library.includeMusicLibrary = false }
                    }
                )) {
                    Label("Incluir la música de la app Música", systemImage: "music.note")
                }
                Button { Task { await library.scan(); router.show("Biblioteca actualizada") } } label: {
                    HStack {
                        Label("Buscar música de nuevo", systemImage: "arrow.clockwise")
                        Spacer()
                        if library.scanning { ProgressView() }
                    }
                }
            } header: {
                Text("Tu música")
            } footer: {
                Text("\(plural(library.tracks.count, "canción", "canciones")) en tu biblioteca. Las canciones de Apple Music protegidas (DRM) no se pueden reproducir en otras apps.")
            }

            Section("Cómo agregar música") {
                AddMusicHelp().padding(.vertical, 4)
            }

            Section("Datos") {
                Button(role: .destructive) { confirmClear = true } label: { Label("Borrar historial de reproducción", systemImage: "clock.arrow.circlepath") }
            }

            Section {
                HStack(spacing: 14) {
                    Image("AppIconPreview")
                        .resizable()
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Pipo Music Player").font(.headline)
                        Text("Versión \(version) para iPhone").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } footer: {
                Text("Tus listas, favoritos y ajustes se guardan solo en este iPhone. Licencia GPL-3.0.")
            }
        }
        .navigationTitle("Ajustes")
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio, .folder], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { Task { await library.importFiles(urls) } }
        }
        .confirmationDialog("Se borrarán «Más reproducidas» y «Reproducidas recientemente». Tus listas y favoritos no cambian.",
                            isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Borrar historial", role: .destructive) {
                userData.clearHistory()
                router.show("Historial borrado")
            }
        }
    }
}
