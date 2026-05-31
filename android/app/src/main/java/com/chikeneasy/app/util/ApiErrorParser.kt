package com.chikeneasy.app.util

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types

object ApiErrorParser {
    private val adapter = Moshi.Builder().build().adapter<Map<String, Any?>>(
        Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
    )

    fun parse(raw: String?, fallback: String = "Request failed"): String {
        val body = raw?.trim().orEmpty()
        if (body.isBlank()) return fallback
        return runCatching {
            val map = adapter.fromJson(body).orEmpty()
            listOf("message", "error", "detail")
                .firstNotNullOfOrNull { key -> map[key]?.toString()?.takeIf { it.isNotBlank() } }
        }.getOrNull() ?: body.take(500)
    }
}
