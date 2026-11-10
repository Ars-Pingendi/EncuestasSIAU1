import AVKit
import MediaPlayer
import SwiftUI
import UIKit

struct ArtworkView: View {
    let key: String?
    let seed: String
    var size: CGFloat? = nil
    var corner: CGFloat = 8
    var round = false
    var icon = "music.note"

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay(content)
            .frame(width: size, height: size)
            .clipShape(round ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: corner, style: .continuous)))
    }

    @ViewBuilder private var content: some View {
        if let img = ArtCache.image(key) {
            Image(uiImage: img).resizable().scaledToFill()
        } else {
            GeometryReader { geo in
                ZStack {
                    LinearGradient(colors: [Color.seeded(seed), Color.seeded(seed).opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: icon)
                        .font(.system(size: max(14, geo.size.width * 0.36), weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.88))
                }
            }
        }
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    var message: String = ""

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 48)).foregroundStyle(.secondary)
            Text(title).font(.title3.bold()).multilineTextAlignment(.center)
            if !message.isEmpty {
                Text(message).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// Cabecera de álbum, artista, lista… con botones de reproducir y aleatorio.
struct CollectionHeader<Extra: View>: View {
    @EnvironmentObject var player: PlayerController
    let kicker: String
    let title: String
    let subtitle: String
    let artKey: String?
    var round = false
    var icon = "music.note"
    let tracks: [Track]
    @ViewBuilder var extra: () -> Extra

    var body: some View {
        VStack(spacing: 14) {
            ArtworkView(key: artKey, seed: title, size: 200, corner: 14, round: round, icon: icon)
                .shadow(color: .black.opacity(0.25), radius: 14, y: 8)
            VStack(spacing: 4) {
                Text(kicker.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(title).font(.title2.bold()).multilineTextAlignment(.center).lineLimit(3)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            HStack(spacing: 12) {
                Button { player.play(tracks, start: 0, shuffled: false) } label: {
                    Label("Reproducir", systemImage: "play.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Button { player.play(tracks, start: 0, shuffled: true) } label: {
                    Label("Aleatorio", systemImage: "shuffle").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .controlSize(.large)
            .disabled(tracks.isEmpty)
            extra()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

extension CollectionHeader where Extra == EmptyView {
    init(kicker: String, title: String, subtitle: String, artKey: String?, round: Bool = false, icon: String = "music.note", tracks: [Track]) {
        self.init(kicker: kicker, title: title, subtitle: subtitle, artKey: artKey, round: round, icon: icon, tracks: tracks) { EmptyView() }
    }
}

struct ToastView: View {
    @EnvironmentObject var router: Router

    var body: some View {
        if let text = router.toast {
            Text(text)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.thinMaterial, in: Capsule())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
                .padding(.top, 8)
                .padding(.horizontal, 24)
                .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

/// Hoja «Compartir» de iOS.
struct ShareSheet: UIViewControllerRepresentable {
    let urls: [URL]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: urls, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Volumen del sistema.
struct SystemVolumeSlider: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let v = MPVolumeView(frame: .zero)
        v.tintColor = UIColor(named: "AccentColor")
        return v
    }

    func updateUIView(_ view: MPVolumeView, context: Context) {}
}

/// Botón para elegir la salida (AirPlay, Bluetooth, altavoz).
struct RoutePickerButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let v = AVRoutePickerView()
        v.activeTintColor = UIColor(named: "AccentColor")
        v.tintColor = .label
        v.prioritizesVideoDevices = false
        return v
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}

struct VerticalSlider: View {
    @Binding var value: Float
    let range: ClosedRange<Float>
    var height: CGFloat = 170

    var body: some View {
        Slider(value: $value, in: range, step: 0.5)
            .frame(width: height)
            .rotationEffect(.degrees(-90))
            .frame(width: 30, height: height)
    }
}

/// Barra de reproducción sobre las pestañas.
struct MiniPlayer: View {
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var router: Router

    var body: some View {
        if let t = player.current {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    ArtworkView(key: t.artKey, seed: t.album.isEmpty ? t.title : t.album, size: 44, corner: 6)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(t.displayArtist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Button { player.togglePlay() } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.title3).frame(width: 40, height: 40)
                    }
                    Button { player.next() } label: {
                        Image(systemName: "forward.fill").font(.title3).frame(width: 40, height: 40)
                    }
                }
                .foregroundStyle(Color.primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                GeometryReader { geo in
                    Capsule().fill(Theme.accent)
                        .frame(width: geo.size.width * CGFloat(player.duration > 0 ? min(1, player.position / player.duration) : 0), height: 2)
                }
                .frame(height: 2)
                .padding(.horizontal, 12)
                .padding(.bottom, 4)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.12), radius: 10, y: 2)
            .padding(.horizontal, 8)
            .padding(.bottom, 4)
            .contentShape(Rectangle())
            .onTapGesture { router.showNowPlaying = true }
        }
    }
}

extension View {
    func miniPlayerInset() -> some View {
        safeAreaInset(edge: .bottom) { MiniPlayer() }
    }
}
