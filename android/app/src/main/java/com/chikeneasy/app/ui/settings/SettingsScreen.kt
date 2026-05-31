package com.chikeneasy.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.BuildConfig
import com.chikeneasy.app.data.model.SettingsDto
import com.chikeneasy.app.ui.components.KeyValue
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.StateScaffold

@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onLoggedOut: () -> Unit) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) onLoggedOut()
    }

    Column(
        Modifier.fillMaxSize().padding(14.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            IconButton(onClick = viewModel::refreshSettings) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh") }
        }
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.message.isNotBlank()) Text(state.message)

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Connection", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                KeyValue("Base URL", state.config.baseUrl)
                KeyValue("Token", if (state.config.hasToken) "saved" else "missing")
                OutlinedTextField(state.baseUrlInput, viewModel::setBaseUrl, label = { Text("Base URL") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    state.tokenInput,
                    viewModel::setToken,
                    label = { Text("API token") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = viewModel::saveConnection) { Text("Save and verify") }
                    OutlinedButton(onClick = viewModel::reverify) { Text("Reverify") }
                    OutlinedButton(onClick = viewModel::logout) {
                        Icon(Icons.Outlined.Logout, contentDescription = null)
                        Text("Logout", Modifier.padding(start = 8.dp))
                    }
                }
            }
        }

        StateScaffold(state.settings, viewModel::refreshSettings) {
            val settings = (state.settings as LoadState.Data<SettingsDto>).value
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Panel API", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    KeyValue("Storage", settings.storageMode)
                    KeyValue("Query token", settings.queryTokenEnabled?.toString())
                    KeyValue("Master key", settings.masterKeySet?.toString())
                    KeyValue("Probe refresh", "${settings.publicProbeRefreshSec ?: 0}s")
                    Text("Warnings", fontWeight = FontWeight.SemiBold)
                    Text(settings.warnings?.toString() ?: "-", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("App", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                KeyValue("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            }
        }
    }
}
