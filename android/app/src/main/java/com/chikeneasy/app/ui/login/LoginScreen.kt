package com.chikeneasy.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    val state by viewModel.state.collectAsState()

    Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
        if (state.checking) {
            CircularProgressIndicator()
            return@Box
        }

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Chiken Easy", style = MaterialTheme.typography.headlineMedium)
                Text("Connect to your control panel with an API token.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = state.baseUrl,
                    onValueChange = viewModel::updateBaseUrl,
                    label = { Text("Panel address") },
                    placeholder = { Text("http://192.168.1.100:3000") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.token,
                    onValueChange = viewModel::updateToken,
                    label = { Text("API token") },
                    placeholder = { Text("ck_xxx") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = viewModel::login, enabled = !state.submitting) {
                        Icon(Icons.Outlined.Login, contentDescription = null)
                        Text("Verify", Modifier.padding(start = 8.dp))
                    }
                    OutlinedButton(onClick = viewModel::clearSaved) {
                        Icon(Icons.Outlined.Delete, contentDescription = null)
                        Text("Clear", Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
}
