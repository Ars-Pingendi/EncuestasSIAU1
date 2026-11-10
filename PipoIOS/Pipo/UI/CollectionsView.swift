import SwiftUI

struct CollectionsView: View {
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var library: LibraryStore
    @State private var creating = false
    @State private var name = ""

    var body: some View {
        List {
            Section {
                NavigationLink(value: Route.favorites) {
                    Label("Favoritos", systemImage: "heart.fill")
                }
                ForEach(SmartList.allCases) { s in
                    NavigationLink(value: Route.smart(s)) { Label(s.title, systemImage: s.icon) }
                }
            }
            Section("Mis listas") {
                ForEach(userData.playlists) { p in
                    NavigationLink(value: Route.playlist(p.id)) {
                        HStack(spacing: 12) {
                            let art = library.tracks(p.trackIds).first { $0.artKey != nil }?.artKey
                            ArtworkView(key: art, seed: p.name, size: 48, icon: "music.note.list")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name).lineLimit(1)
                                Text(plural(p.trackIds.count, "canción", "canciones")).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .onDelete { offsets in
                    for i in offsets { userData.delete(userData.playlists[i].id) }
                }
                Button { creating = true } label: { Label("Nueva lista", systemImage: "plus") }
            }
        }
        .navigationTitle("Listas")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { creating = true } label: { Image(systemName: "plus") }
            }
        }
        .alert("Nueva lista", isPresented: $creating) {
            TextField("Nombre", text: $name)
            Button("Crear") {
                userData.createPlaylist(name)
                name = ""
            }
            Button("Cancelar", role: .cancel) {}
        }
        .navigationDestination(for: Route.self) { RouteView(route: $0) }
    }
}
