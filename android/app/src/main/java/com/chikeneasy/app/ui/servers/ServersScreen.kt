package com.chikeneasy.app.ui.servers

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.AgentDto
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.SimpleList
import com.chikeneasy.app.ui.components.StateScaffold
import com.chikeneasy.app.ui.components.StatusChip
import com.chikeneasy.app.ui.components.formatPercent
import com.chikeneasy.app.ui.components.formatSpeed

@Composable
fun ServersScreen(viewModel: ServersViewModel, openDetail: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Servers", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            IconButton(onClick = viewModel::refresh) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh") }
        }
        val rows = (state as? LoadState.Data<List<AgentDto>>)?.value.orEmpty()
        StateScaffold(state = state, onRetry = viewModel::refresh, empty = rows.isEmpty() && state is LoadState.Data, emptyText = "No agents registered") {
            SimpleList(rows = rows, key = { it.id }) { agent ->
                ServerRow(agent, openDetail)
            }
        }
    }
}

@Composable
private fun ServerRow(agent: AgentDto, openDetail: (String) -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().clickable { openDetail(agent.id) }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text(agent.name ?: agent.id, fontWeight = FontWeight.SemiBold)
                    Text("${agent.host ?: "-"} / ${agent.ip ?: "-"}", style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(if (agent.connected == true) "online" else "offline", agent.connected == true)
                    Icon(Icons.Outlined.ChevronRight, contentDescription = null)
                }
            }
            Text("${agent.os ?: "-"} / ${agent.arch ?: "-"} | sing-box ${agent.singboxStatus ?: "unknown"}")
            Text("CPU ${formatPercent(agent.metrics?.cpu?.usage)}  MEM ${formatPercent(agent.metrics?.memory?.usage)}  RX ${formatSpeed(agent.metrics?.network?.rxRate)}  TX ${formatSpeed(agent.metrics?.network?.txRate)}")
            val tags = listOfNotNull(agent.group, agent.region).filter { it.isNotBlank() } + agent.tags.orEmpty()
            if (tags.isNotEmpty()) Text(tags.joinToString("  "), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
