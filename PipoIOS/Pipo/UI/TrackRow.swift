import SwiftUI

struct RowAction: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    var destructive = false
    let run: () -> Void
}

struct TrackRow: View {
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var userData: UserDataStore
    let track: Track
    var number: Int? = nil
    var isCurrentOverride: Bool? = nil
    var extra: [RowAction] = []
    let onTap: () -> Void

    var body: some View {
        let isCurrent = isCurrentOverride ?? (player.currentId == track.id)
        HStack(spacing: 12) {
            if let number {
                Text("\(number)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(isCurrent ? Theme.accent : Color.secondary)
                    .frame(width: 28)
            } else {
                ArtworkView(key: track.artKey, seed: track.album.isEmpty ? track.title : track.album, size: 48, corner: 6)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .fontWeight(isCurrent ? .semibold : .regular)
                    .foregroundStyle(isCurrent ? Theme.accent : Color.primary)
                    .lineLimit(1)
                Text(track.subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            if userData.isFavorite(track.id) {
                Image(systemName: "heart.fill").font(.caption2).foregroundStyle(Theme.accent)
            }
            Text(formatTime(track.duration)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            Menu {
                TrackMenuItems(track: track, extra: extra)
            } label: {
                Image(systemName: "ellipsis")
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 40)
                    .contentShape(Rectangle())
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .contextMenu { TrackMenuItems(track: track, extra: extra) }
    }
}

struct TrackMenuItems: View {
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var router: Router
    @EnvironmentObject var library: LibraryStore
    let track: Track
    var extra: [RowAction] = []

    var body: some View {
        let fav = userData.isFavorite(track.id)
        Button { player.playNext([track]) } label: { Label("Reproducir a continuación", systemImage: "text.insert") }
        Button { player.addToQueue([track]) } label: { Label("Agregar a la cola", systemImage: "text.append") }
        Button { router.addToPlaylist = TrackBatch(tracks: [track]) } label: { Label("Agregar a una lista…", systemImage: "music.note.list") }
        Button {
            let added = userData.toggleFavorite(track)
            router.show(added ? "Agregada a favoritos" : "Quitada de favoritos")
        } label: {
            Label(fav ? "Quitar de favoritos" : "Agregar a favoritos", systemImage: fav ? "heart.slash" : "heart")
        }
        Button { router.share([track]) } label: { Label("Compartir", systemImage: "square.and.arrow.up") }
        Divider()
        if library.albumByKey[track.albumKey] != nil {
            Button { router.go(.album(track.albumKey)) } label: { Label("Ir al álbum", systemImage: "square.stack") }
        }
        if library.artistByKey[track.artistKey] != nil {
            Button { router.go(.artist(track.artistKey)) } label: { Label("Ir al artista", systemImage: "music.mic") }
        }
        ForEach(extra) { a in
            Button(role: a.destructive ? .destructive : nil, action: a.run) { Label(a.title, systemImage: a.icon) }
        }
        if track.source == .file {
            Button(role: .destructive) { router.confirmDelete = track } label: { Label("Eliminar del iPhone", systemImage: "trash") }
        }
    }
}

/// Lista de canciones con cabecera opcional.
struct TrackListView<Header: View>: View {
    @EnvironmentObject var player: PlayerController
    let tracks: [Track]
    var numbered = false
    var emptyMessage = "No hay canciones."
    @ViewBuilder var header: () -> Header

    var body: some View {
        List {
            header()
                .listRowSeparator(.hidden)
            if tracks.isEmpty {
                EmptyStateView(icon: "music.note", title: emptyMessage).listRowSeparator(.hidden)
            }
            ForEach(Array(tracks.enumerated()), id: \.element.id) { i, t in
                TrackRow(track: t, number: numbered ? (t.trackNo > 0 ? t.trackNo : i + 1) : nil) {
                    player.play(tracks, start: i, shuffled: false)
                }
            }
        }
        .listStyle(.plain)
    }
}
