package com.chikeneasy.app.data.websocket

import com.chikeneasy.app.data.storage.AppPreferences
import com.chikeneasy.app.util.BaseUrlNormalizer
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.net.URLEncoder

sealed interface TerminalEvent {
    data class Output(val text: String) : TerminalEvent
    data class Status(val text: String) : TerminalEvent
    data class Failure(val message: String) : TerminalEvent
    data object Closed : TerminalEvent
}

class TerminalClient(
    private val preferences: AppPreferences,
    private val okHttpClient: OkHttpClient
) {
    private var socket: WebSocket? = null

    suspend fun connect(agentId: String, mode: String): Flow<TerminalEvent> {
        val config = preferences.currentConfig()
        val wsBase = BaseUrlNormalizer.websocketBase(config.baseUrl)
        val encodedAgent = URLEncoder.encode(agentId, "UTF-8")
        val encodedMode = URLEncoder.encode(mode, "UTF-8")
        val url = "$wsBase/terminal?agentId=$encodedAgent&mode=$encodedMode"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${preferences.token()}")
            .build()

        return callbackFlow {
            val listener = object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    socket = webSocket
                    trySend(TerminalEvent.Status("connected"))
                    resize(80, 24)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val event = parseEvent(text)
                    trySend(event)
                }

                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    trySend(TerminalEvent.Output(bytes.utf8()))
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    trySend(TerminalEvent.Status("closing: $reason"))
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    trySend(TerminalEvent.Closed)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    trySend(TerminalEvent.Failure(t.message ?: "terminal websocket failed"))
                }
            }
            val webSocket = okHttpClient.newWebSocket(request, listener)
            socket = webSocket
            awaitClose {
                webSocket.close(1000, "client closed")
                if (socket === webSocket) socket = null
            }
        }
    }

    fun sendInput(input: String) {
        val json = JSONObject()
            .put("type", "input")
            .put("data", input)
            .toString()
        socket?.send(json)
    }

    fun resize(cols: Int, rows: Int) {
        val json = JSONObject()
            .put("type", "resize")
            .put("cols", cols)
            .put("rows", rows)
            .toString()
        socket?.send(json)
    }

    fun close() {
        socket?.close(1000, "client closed")
        socket = null
    }

    private fun parseEvent(text: String): TerminalEvent {
        return runCatching {
            val json = JSONObject(text)
            when {
                json.has("output") -> TerminalEvent.Output(json.optString("output"))
                json.optString("type") == "status" -> TerminalEvent.Status(json.optString("status"))
                json.has("error") -> TerminalEvent.Failure(json.optString("error"))
                else -> TerminalEvent.Output(text)
            }
        }.getOrElse {
            TerminalEvent.Output(text)
        }
    }
}
