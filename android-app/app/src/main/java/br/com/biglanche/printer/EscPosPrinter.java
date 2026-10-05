package br.com.biglanche.printer;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;

import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.UUID;

public final class EscPosPrinter {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final Charset PRINTER_CHARSET = Charset.forName("ISO-8859-1");
    private static final int MAX_ATTEMPTS = 3;

    private EscPosPrinter() {}

    public static void print(BluetoothDevice device, String text) throws Exception {
        printRaw(device, text);
    }

    public static void printRaw(BluetoothDevice device, String raw) throws Exception {
        if (device == null) throw new Exception("Impressora Bluetooth inválida");

        Exception last = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                printOnce(device, raw);
                return;
            } catch (Exception e) {
                last = e;
                if (attempt < MAX_ATTEMPTS) {
                    try { Thread.sleep(450L * attempt); } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw new Exception("Impressão interrompida");
                    }
                }
            }
        }
        throw last == null ? new Exception("Falha na impressão") : last;
    }

    private static void printOnce(BluetoothDevice device, String raw) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter != null && adapter.isDiscovering()) {
            try { adapter.cancelDiscovery(); } catch (Exception ignored) {}
        }

        BluetoothSocket socket = null;
        Exception first = null;
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP);
            socket.connect();
        } catch (Exception secureError) {
            first = secureError;
            closeQuietly(socket);
            socket = null;

            // Algumas impressoras térmicas usam o canal SPP inseguro.
            try {
                socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                socket.connect();
            } catch (Exception insecureError) {
                if (first != null) insecureError.addSuppressed(first);
                throw insecureError;
            }
        }

        try {
            OutputStream out = socket.getOutputStream();
            byte[] bytes = (raw == null ? "" : raw).getBytes(PRINTER_CHARSET);
            out.write(bytes);
            out.flush();

            // Dá tempo para a impressora consumir o buffer antes de fechar
            // o socket, reduzindo cortes de cupom em modelos lentos.
            try { Thread.sleep(180L); } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        } finally {
            closeQuietly(socket);
        }
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket != null) {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }
}
