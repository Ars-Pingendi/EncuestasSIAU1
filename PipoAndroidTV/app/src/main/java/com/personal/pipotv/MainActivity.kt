package com.personal.pipotv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Pipo Music Player para Android TV / Google TV.
 *
 * Muestra a pantalla completa la misma interfaz de la app para televisores LG (carpeta PipoTV),
 * empaquetada dentro del APK, y la conecta con el control remoto de Android:
 * - Atrás y las teclas multimedia se traducen a los códigos que usa la interfaz (los de webOS).
 * - `PipoAndroid` (puente JavaScript): salir, mantener la pantalla encendida mientras suena algo,
 *   abrir el teclado en pantalla y la versión de la app.
 * - Al pasar a segundo plano (Inicio, otra app o se apaga la TV) la música y el video se pausan.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#12101A"))
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Las órdenes del teléfono («Reproducir en la TV») empiezan a sonar sin tocar nada.
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            // La interfaz está diseñada a 1920 × 1080: se escala al tamaño real de la pantalla.
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        web.setInitialScale(initialScale())
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        // La interfaz dibuja su propio foco; sin el recuadro del sistema alrededor de toda la página.
        if (Build.VERSION.SDK_INT >= 26) web.defaultFocusHighlightEnabled = false
        web.addJavascriptInterface(Bridge(), "PipoAndroid")
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(TAG, "${message.messageLevel()} ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }

            // Sin esto, cada video muestra un ícono gris de «play» mientras carga.
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                // La app nunca navega fuera de su página.
                !request.url.toString().startsWith("file:///android_asset/")

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // El motor del navegador se cerró (memoria): se vuelve a abrir la app limpia.
                Log.w(TAG, "WebView cerrado (crash=${if (Build.VERSION.SDK_INT >= 26) detail.didCrash() else "?"})")
                recreate()
                return true
            }
        }
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START_URL)
        web.requestFocus()
    }

    /** Escala para que 1920 píxeles de la interfaz ocupen el ancho de la pantalla. */
    private fun initialScale(): Int {
        val width = resources.displayMetrics.widthPixels.coerceAtLeast(1)
        return (width * 100f / DESIGN_WIDTH).toInt().coerceAtLeast(1)
    }

    private fun hideSystemBars() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = WEB_KEYS[event.keyCode]
        if (code != null) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                web.evaluateJavascript("window.__pipoKey&&window.__pipoKey($code)", null)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStart() {
        super.onStart()
        web.onResume()
        web.resumeTimers()
    }

    override fun onStop() {
        // Primero se pausa lo que suena; después se detiene el trabajo de la página.
        web.evaluateJavascript("window.__pipoLifecycle&&window.__pipoLifecycle('stop')", null)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web.onPause()
        web.pauseTimers()
        super.onStop()
    }

    override fun onDestroy() {
        web.removeJavascriptInterface("PipoAndroid")
        web.destroy()
        super.onDestroy()
    }

    /** Lo que la interfaz puede pedirle a la app (se llama desde JavaScript). */
    private inner class Bridge {
        @JavascriptInterface
        fun exit() = runOnUiThread { finish() }

        @JavascriptInterface
        fun keepAwake(on: Boolean) = runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        @JavascriptInterface
        fun showKeyboard() = runOnUiThread {
            web.requestFocus()
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT)
        }

        @JavascriptInterface
        fun version(): String = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    companion object {
        private const val TAG = "PipoTV"
        private const val START_URL = "file:///android_asset/www/index.html"
        private const val DESIGN_WIDTH = 1920f

        /** Teclas del control de Android → códigos que entiende la interfaz (los del control de LG). */
        private val WEB_KEYS: Map<Int, Int> = mapOf(
            KeyEvent.KEYCODE_BACK to 461,
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE to 10252,
            KeyEvent.KEYCODE_HEADSETHOOK to 10252,
            KeyEvent.KEYCODE_MEDIA_PLAY to 415,
            KeyEvent.KEYCODE_MEDIA_PAUSE to 19,
            KeyEvent.KEYCODE_MEDIA_STOP to 413,
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD to 417,
            KeyEvent.KEYCODE_MEDIA_REWIND to 412,
            KeyEvent.KEYCODE_MEDIA_NEXT to 33,
            KeyEvent.KEYCODE_CHANNEL_UP to 33,
            KeyEvent.KEYCODE_MEDIA_PREVIOUS to 34,
            KeyEvent.KEYCODE_CHANNEL_DOWN to 34,
        )
    }
}
