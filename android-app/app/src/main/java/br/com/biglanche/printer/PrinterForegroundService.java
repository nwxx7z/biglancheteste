package br.com.biglanche.printer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PrinterForegroundService extends Service {
    private static final String CHANNEL_ID = "big_lanche_printer";
    private static final int NOTIFICATION_ID = 1001;
    private static final long POLL_MS = 5_000L;
    private static final long RETRY_BACKOFF_MS = 2_000L;
    private static final String API_BASE = "https://biglanchetestkitchen.vercel.app";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean running = true;
    private final Set<String> printed = new HashSet<>();

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Monitorando pedidos em segundo plano"));
        loadPrinted();
        executor.execute(this::loop);
    }

    private Notification buildNotification(String text) {
        if (Build.VERSION.SDK_INT >= 26) {
            return new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                    .setContentTitle("BIG LANCHE • Cozinha")
                    .setContentText(text)
                    .setOngoing(true)
                    .setCategory(Notification.CATEGORY_SERVICE)
                    .build();
        }
        return new Notification.Builder(this)
                .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                .setContentTitle("BIG LANCHE • Cozinha")
                .setContentText(text)
                .setOngoing(true)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Impressão da cozinha",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém a impressão automática funcionando em segundo plano.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void loop() {
        while (running) {
            try {
                // A impressão automática não depende mais da WebView estar
                // em segundo plano. O serviço verifica os pedidos sempre,
                // inclusive enquanto o painel está aberto.
                checkOrders();
            } catch (Exception ignored) {}
            try { Thread.sleep(POLL_MS); } catch (InterruptedException e) { break; }
        }
    }

    private void checkOrders() throws Exception {
        String cookie = CookieManager.getInstance().getCookie(API_BASE + "/kitchen");
        if (cookie == null || cookie.trim().isEmpty()) {
            // A sessão do painel é a autorização do serviço. Quando ela
            // expirar, a atividade renovará a sessão assim que voltar ao
            // primeiro plano.
            return;
        }

        String mac = getSharedPreferences("printer", MODE_PRIVATE)
                .getString("printer_mac", "");
        if (mac.isEmpty()) return;

        String response = request("GET", API_BASE + "/api/orders", cookie, null);
        if (response == null || response.isEmpty()) return;

        JSONArray orders = new JSONArray(response);

        // O servidor é a fonte da verdade para pedidos: somente "new" entra
        // na fila de impressão. O conjunto local evita reimpressão se o
        // PATCH do servidor falhar ou o serviço reiniciar logo após imprimir.
        for (int i = orders.length() - 1; i >= 0; i--) {
            JSONObject o = orders.optJSONObject(i);
            if (o == null) continue;

            String id = o.optString("id", "");
            String status = o.optString("status", "");
            if (id.isEmpty() || printed.contains(id) || !"new".equalsIgnoreCase(status)) continue;

            JSONObject printable = toPrintableOrder(o);
            String receipt = OrderFormatter.format(printable);

            // O método print só retorna depois de o socket Bluetooth ter
            // enviado e descarregado o buffer. Falha => não marcamos como
            // impresso e o próximo ciclo tenta novamente.
            boolean ok = printWithRetry(mac, receipt);
            if (!ok) continue;

            printed.add(id);
            savePrinted();

            // O PATCH é feito depois do envio físico. Se a rede falhar,
            // o ID persistido evita uma segunda impressão após reinício.
            try {
                request("PATCH", API_BASE + "/api/orders/" + id, cookie,
                        "{\"status\":\"printed\"}");
            } catch (Exception ignored) {}
        }
    }

    private JSONObject toPrintableOrder(JSONObject o) throws Exception {
        JSONObject out = new JSONObject();
        out.put("id", o.optInt("number", 0));
        out.put("createdAt", o.optString("createdAt", ""));

        JSONArray cart = o.optJSONArray("cart");
        JSONArray items = new JSONArray();
        if (cart != null) {
            for (int i = 0; i < cart.length(); i++) {
                JSONObject item = cart.optJSONObject(i);
                if (item == null) continue;
                JSONObject copy = new JSONObject(item.toString());
                items.put(copy);
            }
        }
        out.put("items", items);

        JSONObject delivery = o.optJSONObject("delivery");
        if (delivery != null) {
            out.put("deliveryCity", delivery.optString("city", ""));
            out.put("address", delivery.optString("address", ""));
        }
        out.put("payment", o.optString("payment", ""));
        out.put("notes", o.optString("notes", ""));
        out.put("total", o.optDouble("total", 0));
        return out;
    }

    private boolean printWithRetry(String mac, String receipt) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) throw new Exception("Bluetooth desligado");
                if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    throw new Exception("Permissão Bluetooth não concedida");
                }
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                EscPosPrinter.printRaw(device, receipt);
                return true;
            } catch (Exception e) {
                if (attempt == 2) return false;
                try { Thread.sleep(RETRY_BACKOFF_MS); }
                catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
        }
        return false;
    }

    private String request(String method, String urlText, String cookie, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlText).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(7000);
        c.setReadTimeout(7000);
        c.setRequestProperty("Accept", "application/json");
        if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = c.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        InputStream stream = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (stream == null) return "";
        try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder b = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) b.append(line);
            if (code >= 400) throw new Exception("HTTP " + code);
            return b.toString();
        } finally {
            c.disconnect();
        }
    }

    private void loadPrinted() {
        String raw = getSharedPreferences("printer", MODE_PRIVATE).getString("bg_printed_ids", "");
        if (!raw.isEmpty()) {
            for (String id : raw.split("\\|")) if (!id.isEmpty()) printed.add(id);
        }
    }

    private void savePrinted() {
        StringBuilder b = new StringBuilder();
        int count = 0;
        for (String id : printed) {
            if (id == null || id.isEmpty()) continue;
            if (count++ > 0) b.append('|');
            b.append(id);
            if (count >= 200) break;
        }
        getSharedPreferences("printer", MODE_PRIVATE).edit().putString("bg_printed_ids", b.toString()).apply();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
