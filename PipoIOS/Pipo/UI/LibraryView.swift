import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var player: PlayerController
    @AppStorage("seccion") private var section: LibrarySection = .songs
    @AppStorage("ordenCanciones") private var sort: SongSort = .title
    @State private var query = ""
    @State private var importing = false

    var body: some View {
        content
            .navigationTitle("Biblioteca")
            .searchable(text: $query, prompt: "Canciones, álbumes o artistas")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        if section == .songs {
                            Picker("Ordenar por", selection: $sort) {
                                ForEach(SongSort.allCases) { Text($0.label).tag($0) }
                            }
                        }
                        Button { importing = true } label: { Label("Importar canciones o carpetas", systemImage: "square.and.arrow.down") }
                        Button { Task { await library.scan() } } label: { Label("Buscar música de nuevo", systemImage: "arrow.clockwise") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.audio, .folder], allowsMultipleSelection: true) { result in
                if case .success(let urls) = result { Task { await library.importFiles(urls) } }
            }
            .navigationDestination(for: Route.self) { RouteView(route: $0) }
    }

    @ViewBuilder private var content: some View {
        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
            SearchResultsView(query: query)
        } else if library.tracks.isEmpty {
            EmptyLibraryView(importing: $importing)
        } else {
            VStack(spacing: 0) {
                Picker("Sección", selection: $section) {
                    ForEach(LibrarySection.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 6)
                switch section {
                case .songs:
                    let sorted = library.sortedTracks(library.tracks, by: sort)
                    TrackListView(tracks: sorted) {
                        HStack {
                            Text(plural(sorted.count, "canción", "canciones")).font(.subheadline).foregroundStyle(.secondary)
                            Spacer()
                            Button { player.play(sorted, start: 0, shuffled: true) } label: { Label("Aleatorio", systemImage: "shuffle") }
                                .buttonStyle(.bordered).controlSize(.small)
                        }
                    }
                case .albums:
                    AlbumGrid(albums: library.albums)
                case .artists:
                    List(library.artists) { a in
                        NavigationLink(value: Route.artist(a.key)) {
                            HStack(spacing: 12) {
                                ArtworkView(key: a.artKey, seed: a.name, size: 52, round: true, icon: "music.mic")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.name).lineLimit(1)
                                    Text("\(plural(a.albums.count, "álbum", "álbumes")) · \(plural(a.tracks.count, "canción", "canciones"))")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                case .genres:
                    GroupList(groups: library.genres, icon: "guitars") { Route.genre($0) }
                case .folders:
                    GroupList(groups: library.folders, icon: "folder.fill") { Route.folder($0) }
                }
            }
        }
    }
}

struct AlbumGrid: View {
    let albums: [Album]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], spacing: 18) {
                ForEach(albums) { a in
                    NavigationLink(value: Route.album(a.key)) {
                        VStack(alignment: .leading, spacing: 6) {
                            ArtworkView(key: a.artKey, seed: a.title, corner: 12, icon: "square.stack")
                                .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
                            Text(a.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary).lineLimit(1)
                            Text(a.year > 0 ? "\(a.artist) · \(String(a.year))" : a.artist)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }
}

struct GroupList: View {
    let groups: [TrackGroup]
    let icon: String
    let route: (String) -> Route

    var body: some View {
        List(groups) { g in
            NavigationLink(value: route(g.key)) {
                HStack(spacing: 12) {
                    ArtworkView(key: g.artKey, seed: g.name, size: 52, icon: icon)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(g.name).lineLimit(1)
                        Text(g.subtitle == g.name ? plural(g.tracks.count, "canción", "canciones") : "\(plural(g.tracks.count, "canción", "canciones")) · \(g.subtitle)")
                            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

struct SearchResultsView: View {
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var player: PlayerController
    let query: String

    var body: some View {
        let words = query.folded.split(separator: " ").map(String.init)
        let match: (String) -> Bool = { text in words.allSatisfy { text.contains($0) } }
        let tracks = library.tracks.filter { match($0.searchText) }.prefix(200).map { $0 }
        let albums = library.albums.filter { match("\($0.title) \($0.artist)".folded) }.prefix(20)
        let artists = library.artists.filter { match($0.name.folded) }.prefix(20)
        List {
            if tracks.isEmpty && albums.isEmpty && artists.isEmpty {
                EmptyStateView(icon: "magnifyingglass", title: "Sin resultados", message: "Prueba con otras palabras.")
                    .listRowSeparator(.hidden)
            }
            if !artists.isEmpty {
                Section("Artistas") {
                    ForEach(Array(artists)) { a in
                        NavigationLink(value: Route.artist(a.key)) {
                            Label { Text(a.name) } icon: { ArtworkView(key: a.artKey, seed: a.name, size: 36, round: true, icon: "music.mic") }
                        }
                    }
                }
            }
            if !albums.isEmpty {
                Section("Álbumes") {
                    ForEach(Array(albums)) { a in
                        NavigationLink(value: Route.album(a.key)) {
                            Label { Text("\(a.title) · \(a.artist)").lineLimit(1) } icon: { ArtworkView(key: a.artKey, seed: a.title, size: 36, icon: "square.stack") }
                        }
                    }
                }
            }
            if !tracks.isEmpty {
                Section("Canciones") {
                    ForEach(Array(tracks.enumerated()), id: \.element.id) { i, t in
                        TrackRow(track: t) { player.play(tracks, start: i, shuffled: false) }
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

struct EmptyLibraryView: View {
    @EnvironmentObject var library: LibraryStore
    @Binding var importing: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if library.scanning {
                    ProgressView("Buscando tu música…").padding(.top, 40)
                } else {
                    EmptyStateView(icon: "music.note.house", title: "Agrega tu música",
                                   message: "Pipo reproduce las canciones que guardes en su carpeta y, si quieres, las de la app Música.")
                    Button { importing = true } label: {
                        Label("Importar canciones o carpetas", systemImage: "square.and.arrow.down").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    Button { library.requestMusicLibrary() } label: {
                        Label("Usar la música del iPhone", systemImage: "music.note").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).controlSize(.large)
                    AddMusicHelp().padding(.top, 8)
                }
            }
            .padding()
        }
    }
}

struct AddMusicHelp: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Otras formas de agregar música").font(.headline)
            Label("App **Archivos** › En mi iPhone › **Pipo**: copia o arrastra tus canciones ahí.", systemImage: "folder")
            Label("Desde **WhatsApp, Mail o AirDrop**: toca la canción › Compartir › **Pipo**.", systemImage: "square.and.arrow.down.on.square")
            Label("Desde **Windows**: conecta el iPhone, abre **Dispositivos Apple** (o iTunes) › Archivos › **Pipo** y arrastra la música.", systemImage: "desktopcomputer")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
