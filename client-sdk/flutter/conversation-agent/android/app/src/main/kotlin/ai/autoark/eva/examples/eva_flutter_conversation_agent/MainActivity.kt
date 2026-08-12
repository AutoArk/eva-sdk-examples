package ai.autoark.eva.examples.eva_flutter_conversation_agent

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val missing = arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
            .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            .toTypedArray()
        if (missing.isNotEmpty()) requestPermissions(missing, MEDIA_PERMISSION_REQUEST)
    }

    private companion object {
        const val MEDIA_PERMISSION_REQUEST = 4100
    }
}
