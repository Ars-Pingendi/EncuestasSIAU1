import AVFoundation
import Foundation

/// Reproducción con AVAudioEngine: el archivo se decodifica por trozos (para aplicar el
/// «sonido envolvente») y pasa por un ecualizador de 10 bandas + graves y un limitador.
@MainActor
final class AudioEngine {
    static let shared = AudioEngine()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let eq = AVAudioUnitEQ(numberOfBands: 11)
    private let limiter: AVAudioUnitEffect
    private var file: AVAudioFile?
    private var connectedFormat: AVAudioFormat?
    private var readFrame: AVAudioFramePosition = 0
    private var baseFrame: AVAudioFramePosition = 0
    private var generation = 0
    private var inFlight = 0
    private var width: Float = 0
    private var lastTime: Double = 0
    private let chunk: AVAudioFrameCount = 32768
    private let depth = 3

    private(set) var isPlaying = false
    var onEnded: (() -> Void)?
    /// (empezó, debe reanudar)
    var onInterruption: ((Bool, Bool) -> Void)?
    /// true si se desconectó la salida (por ejemplo, se quitaron los audífonos).
    var onRouteChange: ((Bool) -> Void)?

    private init() {
        let desc = AudioComponentDescription(
            componentType: kAudioUnitType_Effect,
            componentSubType: kAudioUnitSubType_PeakLimiter,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )
        limiter = AVAudioUnitEffect(audioComponentDescription: desc)
        engine.attach(player)
        engine.attach(eq)
        engine.attach(limiter)
        engine.connect(eq, to: limiter, format: nil)
        engine.connect(limiter, to: engine.mainMixerNode, format: nil)
        for (i, hz) in EqMath.bandsHz.enumerated() {
            let band = eq.bands[i]
            band.filterType = .parametric
            band.frequency = hz
            band.bandwidth = 1.0
            band.gain = 0
            band.bypass = false
        }
        let bass = eq.bands[10]
        bass.filterType = .lowShelf
        bass.frequency = EqMath.bassHz
        bass.gain = 0
        bass.bypass = false
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        observe()
    }

    // MARK: Reproducción

    func load(url: URL, at seconds: Double) throws {
        let f = try AVAudioFile(forReading: url)
        generation += 1
        player.stop()
        let format = f.processingFormat
        if connectedFormat == nil || connectedFormat! != format {
            if engine.isRunning { engine.stop() }
            engine.disconnectNodeOutput(player)
            engine.connect(player, to: eq, format: format)
            connectedFormat = format
        }
        file = f
        startScheduling(at: seconds)
    }

    private func startScheduling(at seconds: Double) {
        guard let f = file else { return }
        let sr = f.processingFormat.sampleRate
        let target = AVAudioFramePosition(max(0, seconds) * sr)
        baseFrame = min(target, max(0, f.length - 1))
        readFrame = baseFrame
        inFlight = 0
        lastTime = Double(baseFrame) / sr
        scheduleMore()
    }

    func play() throws {
        guard file != nil else { return }
        try AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
        }
        player.play()
        isPlaying = true
    }

    func pause() {
        lastTime = currentTime
        player.pause()
        isPlaying = false
    }

    func stop() {
        generation += 1
        player.stop()
        file = nil
        isPlaying = false
        inFlight = 0
        lastTime = 0
    }

    func seek(to seconds: Double) {
        guard file != nil else { return }
        let wasPlaying = isPlaying
        generation += 1
        player.stop()
        startScheduling(at: seconds)
        if wasPlaying && engine.isRunning { player.play() }
    }

    var duration: Double {
        guard let f = file else { return 0 }
        return Double(f.length) / f.processingFormat.sampleRate
    }

    var currentTime: Double {
        guard let f = file else { return 0 }
        guard engine.isRunning, let nodeTime = player.lastRenderTime, let t = player.playerTime(forNodeTime: nodeTime) else {
            return lastTime
        }
        let value = min(duration, Double(baseFrame + max(0, t.sampleTime)) / f.processingFormat.sampleRate)
        lastTime = value
        return value
    }

    /// Volumen interno (para el desvanecimiento del temporizador).
    var fadeVolume: Float {
        get { engine.mainMixerNode.outputVolume }
        set { engine.mainMixerNode.outputVolume = newValue }
    }

    // MARK: Decodificación por trozos

    private func scheduleMore() {
        guard let f = file else { return }
        let gen = generation
        while inFlight < depth && readFrame < f.length {
            let remaining = AVAudioFrameCount(min(AVAudioFramePosition(chunk), f.length - readFrame))
            guard let buffer = AVAudioPCMBuffer(pcmFormat: f.processingFormat, frameCapacity: remaining) else { return }
            do {
                f.framePosition = readFrame
                try f.read(into: buffer, frameCount: remaining)
            } catch {
                readFrame = f.length
                break
            }
            if buffer.frameLength == 0 {
                readFrame = f.length
                break
            }
            readFrame += AVAudioFramePosition(buffer.frameLength)
            applyWidth(buffer)
            inFlight += 1
            let last = readFrame >= f.length
            player.scheduleBuffer(buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack) { [weak self] _ in
                Task { @MainActor in self?.bufferFinished(gen: gen, last: last) }
            }
        }
        if readFrame >= f.length && inFlight == 0 {
            Task { @MainActor in
                guard gen == self.generation else { return }
                self.isPlaying = false
                self.onEnded?()
            }
        }
    }

    private func bufferFinished(gen: Int, last: Bool) {
        guard gen == generation else { return }
        inFlight -= 1
        if last && inFlight <= 0 {
            isPlaying = false
            onEnded?()
        } else {
            scheduleMore()
        }
    }

    /// Ensanchador estéreo (medio/lateral).
    private func applyWidth(_ buffer: AVAudioPCMBuffer) {
        guard width > 0.005, buffer.format.channelCount == 2, let ch = buffer.floatChannelData else { return }
        let w = 1 + width * 1.2
        let a = (1 + w) / 2, b = (1 - w) / 2
        let l = ch[0], r = ch[1]
        for i in 0..<Int(buffer.frameLength) {
            let x = l[i], y = r[i]
            l[i] = a * x + b * y
            r[i] = b * x + a * y
        }
    }

    // MARK: Ecualizador

    func apply(_ s: EqSettings) {
        eq.bypass = !s.enabled
        limiter.bypass = !s.enabled
        for i in 0..<10 { eq.bands[i].gain = s.enabled ? s.bands[i] : 0 }
        eq.bands[10].gain = s.enabled ? EqMath.bassDb(s) : 0
        eq.globalGain = s.enabled ? EqMath.preampDb(s) + EqMath.loudnessDb(s) : 0
        width = s.enabled ? s.width / 100 : 0
    }

    // MARK: Sistema

    static func currentOutputName() -> String {
        guard let out = AVAudioSession.sharedInstance().currentRoute.outputs.first else { return "Altavoz del iPhone" }
        switch out.portType {
        case .builtInSpeaker: return "Altavoz del iPhone"
        case .builtInReceiver: return "Auricular del iPhone"
        case .headphones: return "Audífonos con cable"
        case .usbAudio: return "USB: \(out.portName)"
        default: return out.portName
        }
    }

    private func observe() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            guard let info = n.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            var resume = false
            if type == .ended, let opts = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                resume = AVAudioSession.InterruptionOptions(rawValue: opts).contains(.shouldResume)
            }
            let began = type == .began
            Task { @MainActor in
                if began { self?.isPlaying = false }
                self?.onInterruption?(began, resume)
            }
        }
        nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] n in
            let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            let gone = raw.flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) } == .oldDeviceUnavailable
            Task { @MainActor in self?.onRouteChange?(gone) }
        }
        nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.handleConfigurationChange() }
        }
    }

    /// El sistema detuvo el motor (cambio de salida o de formato): se retoma en el mismo punto.
    private func handleConfigurationChange() {
        guard file != nil else { return }
        let position = lastTime
        let wasPlaying = isPlaying
        isPlaying = false
        generation += 1
        player.stop()
        startScheduling(at: position)
        if wasPlaying { try? play() }
    }
}
