package com.chikeneasy.app.ui.dashboard

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
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.DashboardDto
import com.chikeneasy.app.ui.components.KeyValue
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.MetricCard
import com.chikeneasy.app.ui.components.StateScaffold
import com.chikeneasy.app.ui.components.StatusChip
import com.chikeneasy.app.ui.components.formatPercent
import com.chikeneasy.app.ui.components.formatSpeed

@Composable
fun DashboardScreen(viewModel: DashboardViewModel) {
    val state by viewModel.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Dashboard", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            IconButton(onClick = { viewModel.refresh() }) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Refresh")
            }
        }
        StateScaffold(state = state, onRetry = { viewModel.refresh() }) {
            val dashboard = (state as LoadState.Data<DashboardDto>).value
            DashboardContent(dashboard)
        }
    }
}

@Composable
private fun DashboardContent(dashboard: DashboardDto) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            MetricCard("Total", "${dashboard.total ?: 0}", Modifier.weight(1f))
            MetricCard("Online", "${dashboard.online ?: 0}", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            MetricCard("Offline", "${dashboard.offline ?: 0}", Modifier.weight(1f))
            MetricCard("sing-box", "${dashboard.activeSingbox ?: 0}", Modifier.weight(1f))
        }
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Traffic and Load", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                KeyValue("Average CPU", formatPercent(dashboard.averageCpu))
                KeyValue("RX rate", formatSpeed(dashboard.totalRxRate))
                KeyValue("TX rate", formatSpeed(dashboard.totalTxRate))
            }
        }
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Recent agents", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                dashboard.recent.orEmpty().forEach { agent ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(agent.name ?: agent.id, fontWeight = FontWeight.Medium)
                            Text("${agent.host ?: "-"} / ${agent.ip ?: "-"}", style = MaterialTheme.typography.bodySmall)
                        }
                        StatusChip(if (agent.connected == true) "online" else "offline", agent.connected == true)
                    }
                }
                if (dashboard.recent.isNullOrEmpty()) Text("No recent agents", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
