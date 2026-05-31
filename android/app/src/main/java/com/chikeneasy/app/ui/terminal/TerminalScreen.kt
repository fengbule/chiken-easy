package com.chikeneasy.app.ui.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

@Composable
fun TerminalScreen(viewModel: TerminalViewModel, initialAgentId: String = "") {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(initialAgentId, state.agents) {
        if (initialAgentId.isNotBlank()) viewModel.selectAgent(initialAgentId)
    }
    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Terminal", style = MaterialTheme.typography.headlineSmall)
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        TerminalControls(state, viewModel)
        Text(
            state.output.ifBlank { "No terminal output yet." },
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Color(0xFF0B1020))
                .padding(12.dp)
                .verticalScroll(rememberScrollState())
                .horizontalScroll(rememberScrollState()),
            color = Color(0xFFE5E7EB),
            fontFamily = FontFamily.Monospace
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = state.input,
                onValueChange = viewModel::updateInput,
                label = { Text("Command input") },
                modifier = Modifier.weight(1f)
            )
            Button(onClick = viewModel::send, enabled = state.connected) { Text("Send") }
        }
    }
}

@Composable
private fun TerminalControls(state: TerminalUiState, viewModel: TerminalViewModel) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            AgentDropdown(state.agents.map { it.id to (it.name ?: it.id) }, state.selectedAgentId, viewModel::selectAgent)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("ssh", "agent").forEach { mode ->
                    OutlinedButton(onClick = { viewModel.setMode(mode) }, enabled = state.mode != mode) { Text(mode) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::connect, enabled = !state.connecting) { Text(if (state.connected) "Reconnect" else "Connect") }
                OutlinedButton(onClick = viewModel::disconnect) { Text("Disconnect") }
                OutlinedButton(onClick = viewModel::clear) { Text("Clear") }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AgentDropdown(items: List<Pair<String, String>>, selectedId: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = items.firstOrNull { it.first == selectedId }?.second ?: "Select agent"
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text("Agent") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            items.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.second) },
                    onClick = {
                        onSelect(item.first)
                        expanded = false
                    }
                )
            }
        }
    }
}
