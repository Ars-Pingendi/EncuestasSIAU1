package com.example.encuestassiau.ui.admin

import androidx.compose.runtime.Composable
import com.example.encuestassiau.data.Repository

@Composable
fun AdminNavigation(
    repository: Repository,
    onLogout: () -> Unit
) {
    AdminDashboardScreen(
        repository = repository,
        onLogout = onLogout
    )
}
