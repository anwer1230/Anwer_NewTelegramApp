"""
main.py — نقطة الدخول الرئيسية
يشغّل app.py مباشرةً على المنفذ المحدد في متغير البيئة PORT
"""

import os

# إنشاء المجلدات المطلوبة عند البدء
os.makedirs('sessions', exist_ok=True)
os.makedirs('uploads', exist_ok=True)
os.makedirs('uploads/temp', exist_ok=True)
os.makedirs('data', exist_ok=True)
os.makedirs('pptx_app/outputs', exist_ok=True)
os.makedirs('static/css', exist_ok=True)
os.makedirs('static/js', exist_ok=True)
os.makedirs('static/icons', exist_ok=True)

# تشغيل التطبيق مباشرةً من app.py
if __name__ == '__main__':
    # app.py يحتوي على if __name__ == '__main__' خاصته
    # نستدعيه عبر exec لتشغيله كنقطة دخول مستقلة
    import runpy
    runpy.run_path('app.py', run_name='__main__')
