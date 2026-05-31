package com.chikeneasy.app.ui.subscriptions

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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.SubscriptionDto
import com.chikeneasy.app.ui.components.LoadState
import com.chikeneasy.app.ui.components.SimpleList
import com.chikeneasy.app.ui.components.StateScaffold

@Composable
fun SubscriptionsScreen(viewModel: SubscriptionsViewModel) {
    val state by viewModel.state.collectAsState()
    val rows = (state.subscriptions as? LoadState.Data<List<SubscriptionDto>>)?.value.orEmpty()
    Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Subscriptions", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.message.isNotBlank()) Text(state.message)
        Column(Modifier.weight(1f)) {
            StateScaffold(state.subscriptions, viewModel::refresh, empty = rows.isEmpty() && state.subscriptions is LoadState.Data, emptyText = "No subscriptions") {
                SimpleList(rows, key = { it.id }) { subscription ->
                    SubscriptionRow(subscription, selected = subscription.id == state.selectedId, onClick = { viewModel.select(subscription) })
                }
            }
        }
        SubscriptionEditor(state, viewModel)
    }
}

@Composable
private fun SubscriptionRow(subscription: SubscriptionDto, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${if (selected) "* " else ""}${subscription.name ?: subscription.id}", fontWeight = FontWeight.SemiBold)
            Text("${subscription.format ?: "clash"}  nodes ${subscription.nodeCount ?: 0}  access ${subscription.accessCount ?: 0}")
            Text(subscription.url ?: "-", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SubscriptionEditor(state: SubscriptionsUiState, viewModel: SubscriptionsViewModel) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(state.name, viewModel::setName, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(state.format, viewModel::setFormat, label = { Text("Format") }, modifier = Modifier.fillMaxWidth())
            Text("Nodes", fontWeight = FontWeight.SemiBold)
            Column(Modifier.heightIn(max = 120.dp).verticalScroll(rememberScrollState())) {
                state.nodes.forEach { node ->
                    Row(Modifier.fillMaxWidth().clickable { viewModel.toggleNode(node.id) }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = state.selectedNodeIds.contains(node.id), onCheckedChange = { viewModel.toggleNode(node.id) })
                        Text("${node.name ?: node.id} (${node.protocol ?: "-"})")
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::save) { Text(if (state.selectedId.isBlank()) "Create" else "Save") }
                OutlinedButton(onClick = viewModel::preview) { Text("Preview") }
                OutlinedButton(onClick = viewModel::deleteSelected, enabled = state.selectedId.isNotBlank()) { Text("Delete") }
            }
            if (state.preview.isNotBlank()) {
                Text("Preview output", fontWeight = FontWeight.SemiBold)
                Text(state.preview.take(2000), fontFamily = FontFamily.Monospace, modifier = Modifier.heightIn(max = 140.dp).verticalScroll(rememberScrollState()))
            }
        }
    }
}
