package br.com.biglanche.printer;

import org.json.*;
import java.util.*;

public class OrderFormatter {
    private static final String LINE = "------------------------------------------";

    static String money(double v){
        return String.format(Locale.US,"R$ %.2f",v).replace('.',',');
    }

    static String s(JSONObject o,String k){ return o.optString(k,""); }

    public static String format(JSONObject o){
        StringBuilder b=new StringBuilder();

        // ESC/POS básico. O conteúdo é mantido compatível com impressoras
        // térmicas Bluetooth que aceitam texto ISO-8859-1.
        b.append("\u001B@");
        b.append("\u001Ba\u0001");
        b.append("\u001BE\u0001");
        b.append("BIG LANCHE\n");
        b.append("PEDIDO #").append(s(o,"id")).append("\n");
        b.append("\u001BE\u0000");
        b.append(LINE).append("\n");
        b.append("\u001Ba\u0000");

        JSONArray items=o.optJSONArray("items");
        if(items==null) items=o.optJSONArray("order");

        if(items!=null){
            for(int i=0;i<items.length();i++){
                JSONObject it=items.optJSONObject(i);
                if(it==null) continue;

                int q=it.optInt("quantity",it.optInt("qty",1));
                String name=s(it,"name");
                if(name.isEmpty()) name=s(it,"produto");

                b.append(q).append("x ").append(name).append("\n");

                JSONArray adds=it.optJSONArray("additions");
                if(adds==null) adds=it.optJSONArray("adds");
                if(adds!=null){
                    for(int j=0;j<adds.length();j++){
                        JSONObject a=adds.optJSONObject(j);
                        if(a==null) continue;
                        int aq=Math.max(1,a.optInt("quantity",1));
                        String an=a.optString("name","");
                        if(!an.isEmpty()) b.append("   + ").append(aq).append("x ").append(an).append("\n");
                    }
                }

                String note=it.optString("note","");
                if(!note.isEmpty()) b.append("   OBS: ").append(note).append("\n");
            }
        }

        b.append(LINE).append("\n");

        JSONObject delivery=o.optJSONObject("delivery");
        String city=s(o,"deliveryCity");
        String address=s(o,"address");
        double fee=0;

        if(delivery!=null){
            city=delivery.optString("city",city);
            address=delivery.optString("address",address);
            fee=delivery.optDouble("fee",0);
        }

        if(!city.isEmpty()){
            b.append("Entrega: ").append(city);
            if(fee>0) b.append(" ").append(money(fee));
            b.append("\n");
        }else if(fee>0){
            b.append("Taxa entrega: ").append(money(fee)).append("\n");
        }

        b.append("Endereco: ").append(address).append("\n");

        String pay=s(o,"payment");
        if(pay.isEmpty()) pay=s(o,"pagamento");
        b.append("Pagamento: ").append(pay).append("\n");

        String notes=s(o,"notes");
        if(notes.isEmpty()) notes=s(o,"obs");
        if(!notes.isEmpty()) b.append("Obs: ").append(notes).append("\n");

        double total=o.optDouble("total",o.optDouble("totalAmount",0));
        b.append("TOTAL: ").append(money(total)).append("\n");
        b.append("\n\n\n");
        b.append("\u001DV\u0000");

        return b.toString();
    }
}
