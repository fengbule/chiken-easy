package com.chikeneasy.app.ui.nodepool

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.NodeDto
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.SimpleList
import com.chikeneasy.app.ui.components.StateScaffold
import com.chikeneasy.app.ui.terminal.AgentDropdown

@Composable
fun NodePoolScreen(viewModel: NodePoolViewModel) {
    val state by viewModel.state.collectAsState()
    val nodes = (state.nodes as? LoadState.Data<List<NodeDto>>)?.value.orEmpty()
    val filtered = nodes.filter { node ->
        val query = state.query.trim().lowercase()
        query.isBlank() || listOf(node.name, node.protocol, node.address, node.group, node.region).joinToString(" ").lowercase().contains(query)
    }

    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Node Pool", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.message.isNotBlank()) Text(state.message)
        OutlinedTextField(state.query, viewModel::setQuery, label = { Text("Search") }, modifier = Modifier.fillMaxWidth())
        Column(Modifier.weight(1f)) {
            StateScaffold(state.nodes, viewModel::refresh, empty = filtered.isEmpty() && state.nodes is LoadState.Data, emptyText = "No nodes") {
                SimpleList(filtered, key = { it.id }) { node ->
                    NodeRow(node, selected = node.id == state.selectedNodeId, onClick = { viewModel.selectNode(node.id) })
                }
            }
        }
        NodeActions(state, viewModel)
    }
}

@Composable
private fun NodeRow(node: NodeDto, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${if (selected) "* " else ""}${node.name ?: node.id}", fontWeight = FontWeight.SemiBold)
            Text("${node.protocol ?: "-"}://${node.address ?: "-"}:${node.port ?: 0}  ${node.health ?: "unknown"}  score ${node.score ?: 0.0}")
            val tags = listOfNotNull(node.group, node.region).filter { it.isNotBlank() } + node.tags.orEmpty()
            if (tags.isNotEmpty()) Text(tags.joinToString("  "), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!node.lastError.isNullOrBlank()) Text(node.lastError, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun NodeActions(state: NodePoolUiState, viewModel: NodePoolViewModel) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::checkSelected) { Text(if (state.selectedNodeId.isBlank()) "Check All" else "Check Selected") }
                OutlinedButton(onClick = { viewModel.export("clash") }) { Text("Export Clash") }
                OutlinedButton(onClick = viewModel::deleteSelected, enabled = state.selectedNodeId.isNotBlank()) { Text("Delete") }
            }
            AgentDropdown(state.agents.map { it.id to (it.name ?: it.id) }, state.selectedAgentId, viewModel::selectAgent)
            OutlinedButton(onClick = viewModel::importFromAgent, enabled = state.selectedAgentId.isNotBlank()) { Text("Import From Agent") }
            OutlinedTextField(
                state.importText,
                viewModel::setImportText,
                label = { Text("Import text") },
                minLines = 3,
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier.fillMaxWidth()
            )
            Button(onClick = viewModel::importText) { Text("Import") }
            if (state.exportText.isNotBlank()) {
                Text("Export output", fontWeight = FontWeight.SemiBold)
                Text(state.exportText.take(2000), fontFamily = FontFamily.Monospace, modifier = Modifier.heightIn(max = 140.dp).verticalScroll(rememberScrollState()))
            }
        }
    }
}
