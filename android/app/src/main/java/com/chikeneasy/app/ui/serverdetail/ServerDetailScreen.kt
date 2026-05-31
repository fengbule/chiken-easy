package com.chikeneasy.app.ui.serverdetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.data.model.ConfigVersionDto
import com.chikeneasy.app.data.model.OkResponse
import com.chikeneasy.app.ui.components.KeyValue
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.SimpleLineChart
import com.chikeneasy.app.ui.components.StateScaffold
import com.chikeneasy.app.ui.components.StatusChip
import com.chikeneasy.app.ui.components.formatPercent
import com.chikeneasy.app.ui.components.formatSpeed

@Composable
fun ServerDetailScreen(
    agentId: String,
    viewModel: ServerDetailViewModel,
    openTerminal: (String) -> Unit
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(agentId) { viewModel.load(agentId) }

    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Server Detail", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            IconButton(onClick = viewModel::refresh) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh") }
        }
        StateScaffold(state = state.detail, onRetry = viewModel::refresh) {
            val agent = (state.detail as LoadState.Data<AgentDto>).value
            ServerDetailContent(agent, state, viewModel, openTerminal)
        }
    }
}

@Composable
private fun ServerDetailContent(
    agent: AgentDto,
    state: ServerDetailUiState,
    viewModel: ServerDetailViewModel,
    openTerminal: (String) -> Unit
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(agent.name ?: agent.id, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    StatusChip(if (agent.connected == true) "online" else "offline", agent.connected == true)
                }
                KeyValue("Host", agent.host)
                KeyValue("IP", agent.ip)
                KeyValue("OS", listOfNotNull(agent.os, agent.arch).joinToString(" / "))
                KeyValue("sing-box", "${agent.singboxStatus ?: "unknown"} ${agent.singboxVersion ?: ""}".trim())
                KeyValue("SSH", if (agent.sshConfigured == true) "${agent.sshMode}@${agent.sshHost}:${agent.sshPort}" else "not configured")
                KeyValue("Last seen", agent.lastSeen)
            }
        }

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Metrics", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                KeyValue("CPU", formatPercent(agent.metrics?.cpu?.usage))
                KeyValue("Memory", formatPercent(agent.metrics?.memory?.usage))
                KeyValue("Disk", formatPercent(agent.metrics?.disk?.usage))
                KeyValue("RX", formatSpeed(agent.metrics?.network?.rxRate))
                KeyValue("TX", formatSpeed(agent.metrics?.network?.txRate))
                SimpleLineChart(agent.metricsHistory?.raw.orEmpty()) { it.cpuUsage }
            }
        }

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Service Control", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("status", "start", "stop", "restart").forEach { action ->
                        OutlinedButton(onClick = { viewModel.service(action) }) { Text(action) }
                    }
                }
                Button(onClick = { openTerminal(agent.id) }) {
                    Icon(Icons.Outlined.Terminal, contentDescription = null)
                    Text("Terminal", Modifier.padding(start = 8.dp))
                }
                if (state.actionMessage.isNotBlank()) Text(state.actionMessage)
                if (state.actionError.isNotBlank()) Text(state.actionError, color = MaterialTheme.colorScheme.error)
            }
        }

        ConfigPanel(state.config, viewModel::loadConfig)
        VersionsPanel(state.versions, viewModel::loadVersions)

        if (!agent.memos.isNullOrEmpty()) {
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Memos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    agent.memos.forEach { memo -> Text("${memo.title ?: memo.id}: ${memo.content.orEmpty().take(120)}") }
                }
            }
        }
    }
}

@Composable
private fun ConfigPanel(state: LoadState<OkResponse>, reload: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Config", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                IconButton(onClick = reload) { Icon(Icons.Outlined.Refresh, contentDescription = "Reload config") }
            }
            when (state) {
                is LoadState.Data -> Text((state.value.config ?: emptyMap()).toString().take(1200), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                is LoadState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                LoadState.Loading -> Text("Loading...")
                LoadState.Idle -> Text("Not loaded")
            }
        }
    }
}

@Composable
private fun VersionsPanel(state: LoadState<List<ConfigVersionDto>>, reload: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Config Versions", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                IconButton(onClick = reload) { Icon(Icons.Outlined.Refresh, contentDescription = "Reload versions") }
            }
            when (state) {
                is LoadState.Data -> {
                    if (state.value.isEmpty()) Text("No versions")
                    state.value.take(8).forEach { version ->
                        Text("${version.id ?: "-"}  ${version.status ?: "-"}  ${version.at ?: ""}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                    }
                }
                is LoadState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                LoadState.Loading -> Text("Loading...")
                LoadState.Idle -> Text("Not loaded")
            }
        }
    }
}
