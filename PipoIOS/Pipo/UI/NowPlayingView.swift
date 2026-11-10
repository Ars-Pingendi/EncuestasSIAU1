import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var router: Router
    @EnvironmentObject var eq: EqualizerStore
    @State private var scrub: Double?
    @State private var showQueue = false
    @State private var showTimer = false

    var body: some View {
        let t = player.current
        ZStack {
            background(t)
            VStack(spacing: 18) {
                HStack {
                    Button { router.showNowPlaying = false } label: {
                        Image(systemName: "chevron.down").font(.title2.weight(.semibold)).frame(width: 44, height: 44)
                    }
                    Spacer()
                    VStack(spacing: 0) {
                        Text("Reproduciendo").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        if eq.settings.enabled {
                            Text("Ecualizador: \(eq.settings.preset ?? "personalizado")").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Button { showQueue = true } label: {
                        Image(systemName: "list.bullet").font(.title3.weight(.semibold)).frame(width: 44, height: 44)
                    }
                }
                Spacer(minLength: 0)
                ArtworkView(key: t?.artKey, seed: t.map { $0.album.isEmpty ? $0.title : $0.album } ?? "Pipo", corner: 18)
                    .frame(maxWidth: 340)
                    .shadow(color: .black.opacity(0.3), radius: 24, y: 12)
                    .scaleEffect(player.isPlaying ? 1 : 0.92)
                    .animation(.spring(response: 0.4, dampingFraction: 0.75), value: player.isPlaying)
                Spacer(minLength: 0)
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t?.title ?? "Nada en reproducción").font(.title2.bold()).lineLimit(2)
                        Text(t?.displayArtist ?? "").font(.title3).foregroundStyle(Theme.accent).lineLimit(1)
                        if let album = t?.album, !album.isEmpty {
                            Text(album).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    if let t {
                        Button { userData.toggleFavorite(t) } label: {
                            Image(systemName: userData.isFavorite(t.id) ? "heart.fill" : "heart").font(.title2)
                        }
                    }
                }
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(get: { scrub ?? player.position }, set: { scrub = $0 }),
                        in: 0...max(1, player.duration),
                        onEditingChanged: { editing in
                            if !editing, let s = scrub {
                                player.seek(to: s)
                                scrub = nil
                            }
                        }
                    )
                    HStack {
                        Text(formatTime(scrub ?? player.position))
                        Spacer()
                        Text("-" + formatTime(max(0, player.duration - (scrub ?? player.position))))
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                }
                HStack {
                    Button { player.toggleShuffle() } label: {
                        Image(systemName: "shuffle").font(.title3).foregroundStyle(player.shuffle ? Theme.accent : Color.secondary)
                    }
                    Spacer()
                    Button { player.previous() } label: { Image(systemName: "backward.fill").font(.system(size: 32)) }
                    Spacer()
                    Button { player.togglePlay() } label: {
                        Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 76))
                    }
                    Spacer()
                    Button { player.next() } label: { Image(systemName: "forward.fill").font(.system(size: 32)) }
                    Spacer()
                    Button { player.cycleRepeat() } label: {
                        Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").font(.title3)
                            .foregroundStyle(player.repeatMode == .off ? Color.secondary : Theme.accent)
                    }
                }
                .foregroundStyle(Color.primary)
                SystemVolumeSlider().frame(height: 30)
                HStack {
                    RoutePickerButton().frame(width: 36, height: 36)
                    Spacer()
                    if let t {
                        Button { router.addToPlaylist = TrackBatch(tracks: [t]) } label: { Image(systemName: "text.badge.plus") }
                        Spacer()
                        Button { router.share([t]) } label: { Image(systemName: "square.and.arrow.up") }
                        Spacer()
                    }
                    Button {
                        router.showNowPlaying = false
                        router.tab = .equalizer
                    } label: { Image(systemName: "slider.vertical.3") }
                    Spacer()
                    Button { showTimer = true } label: {
                        Image(systemName: "moon.zzz").foregroundStyle(player.sleepActive ? Theme.accent : Color.primary)
                    }
                }
                .font(.title3)
                .foregroundStyle(Color.primary)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .overlay(alignment: .top) { ToastView() }
        .sheet(isPresented: $showQueue) {
            NavigationStack { QueueView() }
                .environmentObject(player)
                .environmentObject(userData)
                .environmentObject(router)
                .environmentObject(LibraryStore.shared)
        }
        .confirmationDialog("Temporizador de apagado", isPresented: $showTimer, titleVisibility: .visible) {
            ForEach([15, 30, 45, 60, 90], id: \.self) { m in
                Button("\(m) minutos") { player.setSleepTimer(minutes: m) }
            }
            Button("Al terminar la canción") { player.setSleepAtEndOfTrack() }
            if player.sleepActive {
                Button("Cancelar temporizador", role: .destructive) { player.setSleepTimer(minutes: nil) }
            }
        }
    }

    @ViewBuilder private func background(_ t: Track?) -> some View {
        ZStack {
            Color(uiColor: .systemBackground)
            if let img = ArtCache.image(t?.artKey) {
                Image(uiImage: img).resizable().scaledToFill().blur(radius: 60).opacity(0.45)
            } else {
                LinearGradient(colors: [Color.seeded(t?.album ?? "Pipo").opacity(0.5), Color.clear], startPoint: .top, endPoint: .bottom)
            }
        }
        .ignoresSafeArea()
    }
}

struct QueueView: View {
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var router: Router
    @EnvironmentObject var userData: UserDataStore
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var name = ""

    var body: some View {
        List {
            if player.queue.isEmpty {
                EmptyStateView(icon: "list.bullet", title: "La cola está vacía").listRowSeparator(.hidden)
            }
            ForEach(Array(player.queue.enumerated()), id: \.offset) { i, id in
                if let t = library.track(id) {
                    TrackRow(track: t, isCurrentOverride: i == player.index) { player.jump(to: i) }
                }
            }
            .onMove { player.move(from: $0, to: $1) }
            .onDelete { player.remove(at: $0) }
        }
        .listStyle(.plain)
        .navigationTitle("Cola de reproducción")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                EditButton()
                Menu {
                    Button { saving = true } label: { Label("Guardar como lista", systemImage: "square.and.arrow.down") }
                    Button(role: .destructive) { player.clear() } label: { Label("Vaciar la cola", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .alert("Guardar como lista", isPresented: $saving) {
            TextField("Nombre", text: $name)
            Button("Guardar") {
                let p = userData.createPlaylist(name, tracks: library.tracks(player.queue))
                router.show("Lista «\(p.name)» creada")
            }
            Button("Cancelar", role: .cancel) {}
        }
    }
}
