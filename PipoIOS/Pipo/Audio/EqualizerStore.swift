import AVFoundation
import Foundation

/// Ajustes del ecualizador, preajustes propios y un perfil por cada salida de audio
/// (altavoz, audífonos con cable, cada dispositivo Bluetooth o AirPlay).
@MainActor
final class EqualizerStore: ObservableObject {
    static let shared = EqualizerStore()

    @Published var settings = EqSettings() {
        didSet {
            AudioEngine.shared.apply(settings)
            if perOutput && !outputName.isEmpty { profiles[outputName] = settings }
            save()
        }
    }
    @Published private(set) var custom: [EqPreset] = []
    @Published var perOutput = true {
        didSet {
            if perOutput && !outputName.isEmpty { profiles[outputName] = settings }
            save()
        }
    }
    @Published private(set) var outputName = ""

    private var profiles: [String: EqSettings] = [:]
    private let file = "ecualizador.json"

    private struct Saved: Codable {
        var current: EqSettings
        var custom: [EqPreset]
        var perOutput: Bool
        var profiles: [String: EqSettings]
    }

    private init() {
        if let s = Storage.load(Saved.self, from: file) {
            custom = s.custom
            perOutput = s.perOutput
            profiles = s.profiles
            settings = s.current.bands.count == 10 ? s.current : EqSettings()
        }
    }

    func start() {
        AudioEngine.shared.apply(settings)
        refreshOutput(announce: false)
    }

    private func save() {
        Storage.save(Saved(current: settings, custom: custom, perOutput: perOutput, profiles: profiles), to: file)
    }

    var allPresets: [EqPreset] { EqMath.builtIn + custom }

    func isCustom(_ name: String) -> Bool { custom.contains { $0.name == name } }

    func applyPreset(_ name: String) {
        guard let p = allPresets.first(where: { $0.name == name }) else { return }
        var s = settings
        s.bands = p.bands
        s.preset = p.name
        s.enabled = true
        settings = s
    }

    func setBand(_ index: Int, _ value: Float) {
        var s = settings
        s.bands[index] = (value * 2).rounded() / 2
        s.preset = nil
        settings = s
    }

    func saveCustom(_ raw: String) {
        var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        if EqMath.builtIn.contains(where: { $0.name.lowercased() == name.lowercased() }) { name += " (mío)" }
        custom.removeAll { $0.name.lowercased() == name.lowercased() }
        custom.append(EqPreset(name: name, bands: settings.bands))
        var s = settings
        s.preset = name
        settings = s
        Router.shared.show("Preajuste «\(name)» guardado")
    }

    func deleteCustom(_ name: String) {
        custom.removeAll { $0.name == name }
        if settings.preset == name {
            var s = settings
            s.preset = nil
            settings = s
        } else {
            save()
        }
    }

    func reset() {
        var s = EqSettings()
        s.enabled = settings.enabled
        settings = s
    }

    /// Detecta la salida actual y, si cambió, carga su ajuste guardado.
    func refreshOutput(announce: Bool) {
        let name = AudioEngine.currentOutputName()
        guard name != outputName else { return }
        outputName = name
        guard perOutput else { return }
        if let saved = profiles[name] {
            if saved != settings {
                settings = saved
                if announce { Router.shared.show("Ecualizador: ajuste de «\(name)»") }
            }
        } else {
            profiles[name] = settings
            save()
        }
    }
}
