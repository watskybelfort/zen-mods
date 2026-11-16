# Matriz de referencia para comparar con mods/youtube-music/phone-remote/nativo/qr.js.
#   python mods/youtube-music/phone-remote/sonda/qr-python.py <texto> <version> <mascara>
import sys, json, qrcode
q = qrcode.QRCode(version=int(sys.argv[2]), error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, mask_pattern=int(sys.argv[3]))
q.add_data(sys.argv[1].encode('utf-8'), optimize=0)
q.make(fit=False)
print(json.dumps([[1 if c else 0 for c in fila] for fila in q.modules], separators=(',', ':')))
