package com.chikeneasy.app.util

object BaseUrlNormalizer {
    fun normalize(input: String): String {
        val trimmed = input.trim().trimEnd('/')
        require(trimmed.isNotEmpty()) { "Panel address is required" }
        val withScheme = if (trimmed.contains("://")) trimmed else "http://$trimmed"
        require(withScheme.startsWith("http://") || withScheme.startsWith("https://")) {
            "Panel address must use http:// or https://"
        }
        return "$withScheme/"
    }

    fun websocketBase(input: String): String {
        val normalized = normalize(input).trimEnd('/')
        return when {
            normalized.startsWith("https://") -> normalized.replaceFirst("https://", "wss://")
            normalized.startsWith("http://") -> normalized.replaceFirst("http://", "ws://")
            else -> normalized
        }
    }
}
