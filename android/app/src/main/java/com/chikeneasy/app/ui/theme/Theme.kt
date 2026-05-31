package com.chikeneasy.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Colors = lightColorScheme(
    primary = Color(0xFF0F766E),
    onPrimary = Color.White,
    secondary = Color(0xFF365314),
    tertiary = Color(0xFF0369A1),
    background = Color(0xFFF8FAFC),
    surface = Color(0xFFFFFFFF),
    error = Color(0xFFB91C1C)
)

@Composable
fun ChikenEasyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Colors,
        content = content
    )
}
