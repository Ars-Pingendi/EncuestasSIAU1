import SwiftUI

struct EqualizerView: View {
    @EnvironmentObject var eq: EqualizerStore
    @State private var saving = false
    @State private var presetName = ""
    @State private var deleting: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                card {
                    Toggle(isOn: $eq.settings.enabled) {
                        Label("Ecualizador", systemImage: "slider.vertical.3").font(.headline)
                    }
                    Divider()
                    HStack(spacing: 12) {
                        Image(systemName: "hifispeaker.fill").foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(eq.outputName.isEmpty ? "Salida de audio" : eq.outputName).font(.subheadline.weight(.semibold))
                            Text(eq.perOutput ? "Cada salida recuerda su propio ajuste" : "El mismo ajuste para todas las salidas")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        RoutePickerButton().frame(width: 32, height: 32)
                    }
                    Toggle("Ajuste por salida (altavoz, audífonos, Bluetooth)", isOn: $eq.perOutput).font(.subheadline)
                }

                card {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(eq.allPresets) { p in
                                Button { eq.applyPreset(p.name) } label: {
                                    HStack(spacing: 4) {
                                        if eq.settings.preset == p.name { Image(systemName: "checkmark").font(.caption.bold()) }
                                        Text(p.name)
                                    }
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 7)
                                    .background(eq.settings.preset == p.name ? Theme.accent.opacity(0.22) : Color(uiColor: .tertiarySystemFill),
                                                in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    if eq.isCustom(p.name) {
                                        Button(role: .destructive) { eq.deleteCustom(p.name) } label: { Label("Eliminar preajuste", systemImage: "trash") }
                                    }
                                }
                            }
                        }
                    }
                    EqCurve(settings: eq.settings).frame(height: 140)
                    HStack(alignment: .bottom, spacing: 0) {
                        ForEach(0..<10, id: \.self) { i in
                            VStack(spacing: 6) {
                                Text(bandText(eq.settings.bands[i])).font(.caption2.monospacedDigit()).foregroundStyle(Theme.accent)
                                VerticalSlider(value: Binding(get: { eq.settings.bands[i] }, set: { eq.setBand(i, $0) }),
                                               range: -EqMath.maxDb...EqMath.maxDb, height: 170)
                                Text(EqMath.labels[i]).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    Text("Reducción automática de ganancia: \(String(format: "%.1f", EqMath.preampDb(eq.settings))) dB · limitador activo")
                        .font(.caption2).foregroundStyle(.secondary)
                    HStack {
                        Button { presetName = ""; saving = true } label: { Label("Guardar preajuste", systemImage: "square.and.arrow.down") }
                        Spacer()
                        Button { eq.reset() } label: { Label("Restablecer", systemImage: "arrow.counterclockwise") }
                    }
                    .font(.subheadline)
                }
                .opacity(eq.settings.enabled ? 1 : 0.5)

                card {
                    effect("Refuerzo de graves", "speaker.wave.3.fill", value: $eq.settings.bass)
                    effect("Sonido envolvente", "dot.radiowaves.left.and.right", value: $eq.settings.width)
                    effect("Amplificación de volumen", "speaker.plus.fill", value: $eq.settings.loudness)
                }
                .opacity(eq.settings.enabled ? 1 : 0.5)
            }
            .padding()
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Ecualizador")
        .alert("Guardar preajuste", isPresented: $saving) {
            TextField("Nombre", text: $presetName)
            Button("Guardar") { eq.saveCustom(presetName) }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private func bandText(_ v: Float) -> String {
        v == 0 ? "0" : String(format: v > 0 ? "+%g" : "%g", v)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) { content() }
            .padding()
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func effect(_ title: String, _ icon: String, value: Binding<Float>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Label(title, systemImage: icon).font(.subheadline)
                Spacer()
                Text("\(Int(value.wrappedValue)) %").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            Slider(value: value, in: 0...100, step: 1)
        }
    }
}

struct EqCurve: View {
    let settings: EqSettings
    private let range = 15.0

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let hd = Double(geo.size.height)
            let y: (Double) -> CGFloat = { db in
                let clamped: Double = max(-range, min(range, db))
                let value: Double = hd / 2 - clamped / range * (hd / 2 - 6)
                return CGFloat(value)
            }
            let points: [CGPoint] = (0...120).map { i in
                let f = 20 * pow(1000, Double(i) / 120)
                return CGPoint(x: w * CGFloat(i) / 120, y: y(EqMath.response(settings, at: f)))
            }
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(uiColor: .tertiarySystemFill))
                ForEach([-12.0, -6.0, 6.0, 12.0], id: \.self) { db in
                    Path { p in p.move(to: CGPoint(x: 0, y: y(db))); p.addLine(to: CGPoint(x: w, y: y(db))) }
                        .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
                }
                Path { p in p.move(to: CGPoint(x: 0, y: y(0))); p.addLine(to: CGPoint(x: w, y: y(0))) }
                    .stroke(Color.secondary.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                Path { p in
                    p.addLines(points)
                    p.addLine(to: CGPoint(x: w, y: h))
                    p.addLine(to: CGPoint(x: 0, y: h))
                    p.closeSubpath()
                }
                .fill(LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                Path { p in p.addLines(points) }
                    .stroke(settings.enabled ? Theme.accent : Color.secondary, lineWidth: 2.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}
