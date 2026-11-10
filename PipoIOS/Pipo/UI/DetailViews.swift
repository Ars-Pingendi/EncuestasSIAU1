import SwiftUI

struct RouteView: View {
    let route: Route

    var body: some View {
        switch route {
        case .album(let key): AlbumDetailView(key: key)
        case .artist(let key): ArtistDetailView(key: key)
        case .genre(let key): GroupDetailView(kind: "Género", key: key, icon: "guitars")
        case .folder(let key): GroupDetailView(kind: "Carpeta", key: key, icon: "folder.fill")
        case .playlist(let id): PlaylistDetailView(id: id)
        case .smart(let kind): SmartListView(kind: kind)
        case .favorites: FavoritesView()
        }
    }
}

struct AlbumDetailView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var router: Router
    let key: String

    var body: some View {
        if let album = library.albumByKey[key] {
            let fav = userData.isFavoriteAlbum(album.key)
            TrackListView(tracks: album.tracks, numbered: true) {
                CollectionHeader(
                    kicker: "Álbum",
                    title: album.title,
                    subtitle: [album.artist, album.year > 0 ? String(album.year) : nil, plural(album.tracks.count, "canción", "canciones"), formatLong(album.duration)]
                        .compactMap { $0 }.joined(separator: " · "),
                    artKey: album.artKey,
                    icon: "square.stack",
                    tracks: album.tracks
                ) {
                    HStack(spacing: 24) {
                        Button {
                            router.show(userData.toggleFavoriteAlbum(album.key) ? "Álbum agregado a favoritos" : "Álbum quitado de favoritos")
                        } label: {
                            Label(fav ? "En favoritos" : "Favorito", systemImage: fav ? "heart.fill" : "heart")
                        }
                        Button { router.addToPlaylist = TrackBatch(tracks: album.tracks) } label: {
                            Label("A una lista", systemImage: "music.note.list")
                        }
                        Button { router.share(album.tracks) } label: {
                            Label("Compartir", systemImage: "square.and.arrow.up")
                        }
                    }
                    .font(.subheadline)
                    .labelStyle(.iconOnly)
                    .imageScale(.large)
                }
            }
            .navigationTitle(album.title)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            EmptyStateView(icon: "square.stack", title: "Álbum no encontrado")
        }
    }
}

struct ArtistDetailView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var router: Router
    let key: String

    var body: some View {
        if let artist = library.artistByKey[key] {
            List {
                CollectionHeader(
                    kicker: "Artista",
                    title: artist.name,
                    subtitle: "\(plural(artist.albums.count, "álbum", "álbumes")) · \(plural(artist.tracks.count, "canción", "canciones"))",
                    artKey: artist.artKey,
                    round: true,
                    icon: "music.mic",
                    tracks: artist.tracks
                )
                .listRowSeparator(.hidden)
                if artist.albums.count > 0 {
                    Section("Álbumes") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 14) {
                                ForEach(artist.albums) { a in
                                    Button { router.go(.album(a.key)) } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            ArtworkView(key: a.artKey, seed: a.title, size: 130, corner: 10, icon: "square.stack")
                                            Text(a.title).font(.caption.weight(.semibold)).foregroundStyle(Color.primary).lineLimit(1).frame(width: 130, alignment: .leading)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .listRowSeparator(.hidden)
                }
                Section("Canciones") {
                    ForEach(Array(artist.tracks.enumerated()), id: \.element.id) { i, t in
                        TrackRow(track: t) { player.play(artist.tracks, start: i, shuffled: false) }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle(artist.name)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            EmptyStateView(icon: "music.mic", title: "Artista no encontrado")
        }
    }
}

struct GroupDetailView: View {
    @EnvironmentObject var library: LibraryStore
    let kind: String
    let key: String
    let icon: String

    var body: some View {
        let groups = kind == "Género" ? library.genres : library.folders
        if let g = groups.first(where: { $0.key == key }) {
            TrackListView(tracks: g.tracks) {
                CollectionHeader(kicker: kind, title: g.name, subtitle: g.subtitle, artKey: g.artKey, icon: icon, tracks: g.tracks)
            }
            .navigationTitle(g.name)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            EmptyStateView(icon: icon, title: "No encontrado")
        }
    }
}

struct PlaylistDetailView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var router: Router
    @Environment(\.dismiss) private var dismiss
    let id: UUID
    @State private var renaming = false
    @State private var newName = ""
    @State private var confirmDelete = false

    var body: some View {
        if let p = userData.playlist(id) {
            // Las canciones que ya no existen se muestran como faltantes, sin desordenar la lista.
            let items = p.trackIds.enumerated().map { PlaylistItem(id: $0.offset, track: library.track($0.element)) }
            let tracks = items.compactMap { $0.track }
            List {
                CollectionHeader(kicker: "Lista", title: p.name,
                                 subtitle: "\(plural(tracks.count, "canción", "canciones")) · \(formatLong(tracks.reduce(0) { $0 + $1.duration }))",
                                 artKey: tracks.first { $0.artKey != nil }?.artKey, icon: "music.note.list", tracks: tracks)
                    .listRowSeparator(.hidden)
                    .moveDisabled(true)
                    .deleteDisabled(true)
                if tracks.isEmpty {
                    EmptyStateView(icon: "music.note.list", title: "Lista vacía",
                                   message: "Agrega canciones desde su menú (•••) › «Agregar a una lista…».")
                        .listRowSeparator(.hidden)
                }
                ForEach(items) { item in
                    if let t = item.track {
                        TrackRow(track: t, extra: [
                            RowAction(title: "Quitar de esta lista", icon: "minus.circle", destructive: true) {
                                userData.remove(at: IndexSet(integer: item.id), from: id)
                            },
                        ]) {
                            if let i = tracks.firstIndex(of: t) { player.play(tracks, start: i, shuffled: false) }
                        }
                    } else {
                        Text("Canción no disponible").foregroundStyle(.secondary)
                    }
                }
                .onMove { userData.move(from: $0, to: $1, in: id) }
                .onDelete { userData.remove(at: $0, from: id) }
            }
            .listStyle(.plain)
            .navigationTitle(p.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    EditButton()
                    Menu {
                        Button { router.share(tracks) } label: { Label("Compartir canciones", systemImage: "square.and.arrow.up") }
                        Button { newName = p.name; renaming = true } label: { Label("Cambiar nombre", systemImage: "pencil") }
                        Button(role: .destructive) { confirmDelete = true } label: { Label("Eliminar lista", systemImage: "trash") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .alert("Cambiar nombre", isPresented: $renaming) {
                TextField("Nombre de la lista", text: $newName)
                Button("Guardar") { userData.rename(id, to: newName) }
                Button("Cancelar", role: .cancel) {}
            }
            .confirmationDialog("¿Eliminar «\(p.name)»? Las canciones no se borran.", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Eliminar lista", role: .destructive) {
                    dismiss()
                    userData.delete(id)
                }
            }
        } else {
            EmptyStateView(icon: "music.note.list", title: "Lista no encontrada")
        }
    }
}

struct PlaylistItem: Identifiable {
    let id: Int
    let track: Track?
}

struct SmartListView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    let kind: SmartList

    var body: some View {
        let tracks: [Track] = {
            switch kind {
            case .recent:
                return Array(library.tracks.sorted { $0.addedAt > $1.addedAt }.prefix(100))
            case .top:
                let ids = userData.stats.filter { $0.value.plays > 0 }
                    .sorted { $0.value.plays == $1.value.plays ? $0.value.last > $1.value.last : $0.value.plays > $1.value.plays }
                    .prefix(100).map { $0.key }
                return library.tracks(Array(ids))
            case .played:
                let ids = userData.stats.sorted { $0.value.last > $1.value.last }.prefix(100).map { $0.key }
                return library.tracks(Array(ids))
            }
        }()
        TrackListView(tracks: tracks, emptyMessage: "Aparecerán aquí a medida que escuches música.") {
            CollectionHeader(kicker: "Lista automática", title: kind.title, subtitle: plural(tracks.count, "canción", "canciones"),
                             artKey: nil, icon: kind.icon, tracks: tracks)
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct FavoritesView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    @State private var showAlbums = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("Favoritos", selection: $showAlbums) {
                Text("Canciones").tag(false)
                Text("Álbumes").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 6)
            if showAlbums {
                let albums = userData.favAlbums.compactMap { library.albumByKey[$0] }
                if albums.isEmpty {
                    EmptyStateView(icon: "heart", title: "Sin álbumes favoritos", message: "Abre un álbum y toca el corazón.")
                    Spacer()
                } else {
                    AlbumGrid(albums: albums)
                }
            } else {
                TrackListView(tracks: library.tracks(userData.favTracks),
                              emptyMessage: "Toca «Agregar a favoritos» en el menú de cualquier canción.") { EmptyView() }
            }
        }
        .navigationTitle("Favoritos")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AddToPlaylistSheet: View {
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var router: Router
    @Environment(\.dismiss) private var dismiss
    let tracks: [Track]
    @State private var creating = false
    @State private var name = ""

    var body: some View {
        NavigationStack {
            List {
                Button { creating = true } label: { Label("Nueva lista…", systemImage: "plus.circle.fill") }
                ForEach(userData.playlists) { p in
                    Button {
                        let n = userData.add(tracks, to: p.id)
                        dismiss()
                        router.show(n == 0 ? "Ya estaba en «\(p.name)»" : "\(plural(n, "canción agregada", "canciones agregadas")) a «\(p.name)»")
                    } label: {
                        HStack {
                            Label(p.name, systemImage: "music.note.list").foregroundStyle(Color.primary)
                            Spacer()
                            Text("\(p.trackIds.count)").foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Agregar a una lista")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            }
            .alert("Nueva lista", isPresented: $creating) {
                TextField("Nombre", text: $name)
                Button("Crear") {
                    let p = userData.createPlaylist(name, tracks: tracks)
                    dismiss()
                    router.show("Lista «\(p.name)» creada")
                }
                Button("Cancelar", role: .cancel) {}
            }
        }
        .presentationDetents([.medium, .large])
    }
}
