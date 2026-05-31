package com.chikeneasy.app.data.api

import com.chikeneasy.app.util.BaseUrlNormalizer
import com.chikeneasy.app.data.model.JsonElement
import com.chikeneasy.app.data.model.JsonElementAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class ApiClientFactory {
    private val moshi = Moshi.Builder()
        .add(JsonElement::class.java, JsonElementAdapter())
        .add(KotlinJsonAdapterFactory())
        .build()

    fun api(baseUrl: String, tokenProvider: () -> String): ChikenApiService {
        val client = okHttp(tokenProvider)
        return Retrofit.Builder()
            .baseUrl(BaseUrlNormalizer.normalize(baseUrl))
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(ChikenApiService::class.java)
    }

    fun okHttp(tokenProvider: () -> String): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
            redactHeader("Authorization")
        }
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
