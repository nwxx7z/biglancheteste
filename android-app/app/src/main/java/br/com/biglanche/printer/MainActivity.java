package br.com.biglanche.printer;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;
import android.view.Gravity;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int REQ_BT = 100;
    private static final String PREFS = "printer";
    private static final String DEFAULT_URL = "https://biglanchetestekitchen.vercel.app/kitchen";

    private WebView web;
    private TextView status;
    private boolean pageLoaded = false;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        buildUi();
        configureWebView();
        loadKitchen();
        requestNotificationPermission();
        requestBluetoothPermissions();
        if (hasBtPermission()) startPrinterService();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        LinearLayout top = new LinearLayout(this);
        top.setPadding(12, 5, 12, 5);
        top.setGravity(Gravity.CENTER_VERTICAL);

        status = new TextView(this);
        status.setText(isPrinterConfigured() ? "Impressora configurada" : "Impressora não configurada");
        status.setTextSize(13);
        top.addView(status, new LinearLayout.LayoutParams(0, -2, 1));

        Button settings = new Button(this);
        settings.setText("🖨️");
        top.addView(settings, new LinearLayout.LayoutParams(58, 52));
        root.addView(top);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF3EEE8);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);

        settings.setOnClickListener(v -> showPrinterDialog());
    }

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new PrinterBridge(), "AndroidPrinter");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                pageLoaded = true;
                try { android.webkit.CookieManager.getInstance().flush(); } catch (Exception ignored) {}
                injectBridgeScript();
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    status.setText("Falha ao carregar o painel");
                }
            }
        });
    }

    private void injectBridgeScript() {
        web.evaluateJavascript(
                "window.BIGLANCHE_ANDROID_PRINTER=true;" +
                "window.BIGLANCHE_ANDROID_BACKGROUND_PRINTER=true;",
                null
        );
    }

    private void loadKitchen() {
        web.loadUrl(getPreferences(0).getString("url", DEFAULT_URL));
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
        }
    }

    private void startPrinterService() {
        try {
            Intent intent = new Intent(this, PrinterForegroundService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
        } catch (Exception e) {
            status.setText("Serviço de impressão indisponível");
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_BT && hasBtPermission()) {
            startPrinterService();
        }
    }

    @Override protected void onStart() {
        super.onStart();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("app_foreground", true).apply();
        if (hasBtPermission()) startPrinterService();
    }

    @Override protected void onStop() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("app_foreground", false).apply();
        super.onStop();
    }

    private boolean hasBtPermission() {
        return Build.VERSION.SDK_INT < 31 ||
                checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<String> p = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                p.add(Manifest.permission.BLUETOOTH_CONNECT);
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                p.add(Manifest.permission.BLUETOOTH_SCAN);
            if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), REQ_BT);
        }
    }

    private boolean isPrinterConfigured() {
        return !getSharedPreferences(PREFS, MODE_PRIVATE).getString("printer_mac", "").isEmpty();
    }

    private void showPrinterDialog() {
        if (!hasBtPermission()) {
            requestBluetoothPermissions();
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            toast("Este celular não possui Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            toast("Ative o Bluetooth e pareie a impressora.");
            return;
        }

        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null || bonded.isEmpty()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            toast("Pareie a impressora nas configurações do Bluetooth primeiro.");
            return;
        }

        List<BluetoothDevice> devices = new ArrayList<>(bonded);
        String[] names = new String[devices.size()];
        for (int i = 0; i < devices.size(); i++) {
            BluetoothDevice d = devices.get(i);
            String name = d.getName();
            names[i] = (name == null || name.trim().isEmpty() ? "Dispositivo Bluetooth" : name)
                    + "\n" + d.getAddress();
        }

        new AlertDialog.Builder(this)
                .setTitle("Escolha a impressora")
                .setItems(names, (dialog, which) -> {
                    BluetoothDevice d = devices.get(which);
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                            .putString("printer_mac", d.getAddress())
                            .putString("printer_name", safeName(d))
                            .apply();
                    status.setText("Impressora: " + safeName(d));
                    testPrint(d);
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private String safeName(BluetoothDevice d) {
        String n = d.getName();
        return n == null || n.trim().isEmpty() ? "Bluetooth" : n;
    }

    private void testPrint(BluetoothDevice d) {
        new Thread(() -> {
            try {
                EscPosPrinter.print(d, "\u001B\u0040BIG LANCHE\n\nTESTE DE IMPRESSAO\n\n");
                runOnUiThread(() -> toast("Teste enviado. Se a impressora estiver desligada, nada será impresso."));
            } catch (Exception e) {
                runOnUiThread(() -> toast("Não foi possível conectar: " + cleanError(e)));
            }
        }, "printer-test").start();
    }

    private String cleanError(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }

    private boolean printEscPosSync(String raw) {
        // A configuração da impressora e o serviço de segundo plano usam
        // exatamente o mesmo SharedPreferences. O código antigo usava
        // Activity#getPreferences() aqui e SharedPreferences("printer")
        // para salvar, fazendo o APK "perder" a impressora.
        String mac = getSharedPreferences(PREFS, MODE_PRIVATE).getString("printer_mac", "");
        if (mac.isEmpty()) {
            runOnUiThread(() -> status.setText("Impressora não configurada"));
            return false;
        }
        if (!hasBtPermission()) {
            runOnUiThread(this::requestBluetoothPermissions);
            return false;
        }

        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) throw new Exception("Bluetooth desligado");
            BluetoothDevice d = adapter.getRemoteDevice(mac);
            EscPosPrinter.printRaw(d, raw);
            runOnUiThread(() -> status.setText("Impressão enviada"));
            return true;
        } catch (Exception e) {
            runOnUiThread(() -> status.setText("Falha na impressão: " + cleanError(e)));
            return false;
        }
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    private void simulatePrint(String raw) {
        String text = raw == null ? "" : raw;
        // Remove the most common ESC/POS control sequences so the user can
        // preview what would be sent to the thermal printer.
        text = text.replaceAll("\\x1B\\x40", "")
                .replaceAll("\\x1B\\x61[0-2]", "")
                .replaceAll("\\x1B\\x45[0-1]", "")
                .replaceAll("\\x1D\\x56[0-9A-Fa-f]", "")
                .replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "");

        TextView preview = new TextView(this);
        preview.setText(text.trim());
        preview.setTextSize(15);
        preview.setTextColor(0xFF222222);
        preview.setPadding(24, 20, 24, 20);
        preview.setTypeface(android.graphics.Typeface.MONOSPACE);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(preview);

        new AlertDialog.Builder(this)
                .setTitle("🧪 Simulação de impressão")
                .setMessage("Nenhum dado foi enviado para uma impressora. Isto é apenas uma prévia do cupom.")
                .setView(scroll)
                .setPositiveButton("Fechar", null)
                .show();
    }

    public class PrinterBridge {
        @JavascriptInterface public boolean isReady() { return isPrinterConfigured() && hasBtPermission(); }
        @JavascriptInterface public boolean connectPrinter() {
            runOnUiThread(MainActivity.this::showPrinterDialog);
            return true;
        }
        @JavascriptInterface public boolean printEscPos(String raw) {
            // addJavascriptInterface executa o método fora da UI thread.
            // Esperamos o envio físico terminar para que o JavaScript só
            // marque o pedido como "printed" quando o cupom realmente foi
            // enviado ao Bluetooth.
            return MainActivity.this.printEscPosSync(raw == null ? "" : raw);
        }
        @JavascriptInterface public boolean simulatePrint(String raw) {
            runOnUiThread(() -> MainActivity.this.simulatePrint(raw == null ? "" : raw));
            return true;
        }
        @JavascriptInterface public void disconnectPrinter() {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("printer_mac").remove("printer_name").apply();
            runOnUiThread(() -> status.setText("Impressora não configurada"));
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
