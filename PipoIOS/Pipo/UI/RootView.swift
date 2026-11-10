import SwiftUI

struct RootView: View {
    @EnvironmentObject var router: Router
    @EnvironmentObject var library: LibraryStore
    @EnvironmentObject var userData: UserDataStore
    @EnvironmentObject var player: PlayerController
    @EnvironmentObject var eq: EqualizerStore

    var body: some View {
        TabView(selection: $router.tab) {
            NavigationStack(path: $router.libraryPath) { LibraryView() }
                .miniPlayerInset()
                .tabItem { Label("Biblioteca", systemImage: "music.note.house.fill") }
                .tag(Tab.library)
            NavigationStack(path: $router.listsPath) { CollectionsView() }
                .miniPlayerInset()
                .tabItem { Label("Listas", systemImage: "music.note.list") }
                .tag(Tab.lists)
            NavigationStack { EqualizerView() }
                .miniPlayerInset()
                .tabItem { Label("Ecualizador", systemImage: "slider.vertical.3") }
                .tag(Tab.equalizer)
            NavigationStack { SettingsView() }
                .miniPlayerInset()
                .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
                .tag(Tab.settings)
        }
        .overlay(alignment: .top) { ToastView() }
        .overlay {
            if router.preparingShare {
                ProgressView("Preparando…")
                    .padding(20)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .fullScreenCover(isPresented: $router.showNowPlaying) {
            NowPlayingView()
                .environmentObject(router)
                .environmentObject(library)
                .environmentObject(userData)
                .environmentObject(player)
                .environmentObject(eq)
                .background(EmptyView().sheet(item: $router.sharePayload) { ShareSheet(urls: $0.urls).ignoresSafeArea() })
                .background(EmptyView().sheet(item: $router.addToPlaylist) { batch in
                    AddToPlaylistSheet(tracks: batch.tracks).environmentObject(userData).environmentObject(router)
                })
        }
        .background(EmptyView().sheet(item: router.showNowPlaying ? .constant(nil) : $router.sharePayload) {
            ShareSheet(urls: $0.urls).ignoresSafeArea()
        })
        .background(EmptyView().sheet(item: router.showNowPlaying ? .constant(nil) : $router.addToPlaylist) { batch in
            AddToPlaylistSheet(tracks: batch.tracks).environmentObject(userData).environmentObject(router)
        })
        .confirmationDialog(
            "¿Eliminar «\(router.confirmDelete?.title ?? "")» del iPhone?",
            isPresented: Binding(get: { router.confirmDelete != nil }, set: { if !$0 { router.confirmDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Eliminar", role: .destructive) {
                if let t = router.confirmDelete { Task { await library.deleteFile(t) } }
                router.confirmDelete = nil
            }
        }
    }
}
