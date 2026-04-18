import base64
import io

import qrcode


def qr_code_data_url(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"
