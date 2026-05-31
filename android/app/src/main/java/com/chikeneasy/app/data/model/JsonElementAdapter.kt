package com.chikeneasy.app.data.model

import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter

class JsonElementAdapter : JsonAdapter<JsonElement?>() {
    override fun fromJson(reader: JsonReader): JsonElement? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Unit>()
                JsonElement.NullValue
            }
            JsonReader.Token.BOOLEAN -> JsonElement.BooleanValue(reader.nextBoolean())
            JsonReader.Token.NUMBER -> JsonElement.NumberValue(reader.nextDouble())
            JsonReader.Token.STRING -> JsonElement.StringValue(reader.nextString())
            JsonReader.Token.BEGIN_ARRAY -> {
                val values = mutableListOf<JsonElement?>()
                reader.beginArray()
                while (reader.hasNext()) values += fromJson(reader)
                reader.endArray()
                JsonElement.ArrayValue(values)
            }
            JsonReader.Token.BEGIN_OBJECT -> {
                val values = linkedMapOf<String, JsonElement?>()
                reader.beginObject()
                while (reader.hasNext()) values[reader.nextName()] = fromJson(reader)
                reader.endObject()
                JsonElement.ObjectValue(values)
            }
            else -> throw JsonDataException("Unexpected token ${reader.peek()} at ${reader.path}")
        }
    }

    override fun toJson(writer: JsonWriter, value: JsonElement?) {
        when (value) {
            null, JsonElement.NullValue -> writer.nullValue()
            is JsonElement.BooleanValue -> writer.value(value.value)
            is JsonElement.NumberValue -> writer.value(value.value)
            is JsonElement.StringValue -> writer.value(value.value)
            is JsonElement.ArrayValue -> {
                writer.beginArray()
                value.value.forEach { toJson(writer, it) }
                writer.endArray()
            }
            is JsonElement.ObjectValue -> {
                writer.beginObject()
                value.value.forEach { (name, child) ->
                    writer.name(name)
                    toJson(writer, child)
                }
                writer.endObject()
            }
        }
    }
}
