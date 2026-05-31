package com.chikeneasy.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chikeneasy.app.data.model.MetricSampleDto
import java.text.DecimalFormat

@Composable
fun StateScaffold(
    state: LoadState<*>,
    onRetry: () -> Unit,
    empty: Boolean = false,
    emptyText: String = "No data",
    content: @Composable () -> Unit
) {
    when {
        state is LoadState.Idle -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state is LoadState.Loading -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state is LoadState.Error -> ErrorPanel(message = state.message, onRetry = onRetry)
        empty -> EmptyPanel(text = emptyText, onRetry = onRetry)
        else -> content()
    }
}

@Composable
fun ErrorPanel(message: String, onRetry: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Request failed", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(message, color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = onRetry) {
                Icon(Icons.Outlined.Refresh, contentDescription = null)
                Text("Retry", Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
fun EmptyPanel(text: String, onRetry: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().padding(12.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
            IconButton(onClick = onRetry) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Refresh")
            }
        }
    }
}

@Composable
fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    ElevatedCard(modifier) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun KeyValue(label: String, value: String?) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value?.takeIf { it.isNotBlank() } ?: "-", fontWeight = FontWeight.Medium)
    }
}

@Composable
fun StatusChip(text: String, good: Boolean) {
    AssistChip(
        onClick = {},
        label = { Text(text) },
        leadingIcon = {
            Canvas(Modifier.size(8.dp)) {
                drawCircle(if (good) Color(0xFF16A34A) else Color(0xFF94A3B8))
            }
        }
    )
}

@Composable
fun SimpleLineChart(samples: List<MetricSampleDto>, value: (MetricSampleDto) -> Double?) {
    val color = MaterialTheme.colorScheme.primary
    val points = samples.mapNotNull(value).takeLast(40)
    Canvas(Modifier.fillMaxWidth().height(96.dp).padding(vertical = 8.dp)) {
        if (points.size < 2) return@Canvas
        val min = points.minOrNull() ?: 0.0
        val max = points.maxOrNull() ?: 1.0
        val range = (max - min).takeIf { it > 0.001 } ?: 1.0
        val step = size.width / (points.lastIndex.coerceAtLeast(1))
        var previous: Offset? = null
        points.forEachIndexed { index, item ->
            val x = index * step
            val y = size.height - (((item - min) / range).toFloat() * size.height)
            val current = Offset(x, y)
            previous?.let { drawLine(color, it, current, strokeWidth = 4f) }
            previous = current
        }
    }
}

@Composable
fun TextList(title: String, rows: List<String>) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            rows.forEach { Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
fun <T> SimpleList(
    rows: List<T>,
    key: (T) -> String,
    row: @Composable (T) -> Unit
) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(rows, key = key) { item ->
            row(item)
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

fun formatPercent(value: Double?): String = if (value == null) "-" else "${DecimalFormat("0.#").format(value)}%"

fun formatSpeed(value: Double?): String {
    val number = value ?: return "-"
    val units = listOf("B/s", "KB/s", "MB/s", "GB/s")
    var current = number
    var index = 0
    while (current >= 1024 && index < units.lastIndex) {
        current /= 1024
        index += 1
    }
    return "${DecimalFormat("0.#").format(current)} ${units[index]}"
}

fun formatBytes(value: Long?): String {
    var current = (value ?: return "-").toDouble()
    val units = listOf("B", "KB", "MB", "GB")
    var index = 0
    while (current >= 1024 && index < units.lastIndex) {
        current /= 1024
        index += 1
    }
    return "${DecimalFormat("0.#").format(current)} ${units[index]}"
}
