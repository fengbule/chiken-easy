package com.chikeneasy.app.data.api

import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenProvider: () -> String
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider().trim()
        val request = if (token.isNotBlank()) {
            chain.request().newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
