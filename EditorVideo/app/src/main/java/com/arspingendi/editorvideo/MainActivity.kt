package com.arspingendi.editorvideo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.arspingendi.editorvideo.ui.AppTheme
import com.arspingendi.editorvideo.ui.EditorScreen

class MainActivity : ComponentActivity() {

    private val viewModel: EditorViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AppTheme {
                EditorScreen(viewModel)
            }
        }
    }
}
