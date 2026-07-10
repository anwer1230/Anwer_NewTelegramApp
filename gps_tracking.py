"""
gps_tracking.py
══════════════════════════════════════════════════════════════
نظام التعقب الجغرافي عبر GPS وعناوين IP — وحدة مستقلة
يُوفّر تحديد الموقع الدقيق للزوار عبر ip-api.com
══════════════════════════════════════════════════════════════
"""

import logging

logger = logging.getLogger(__name__)


def geo_lookup(ip: str) -> dict:
    """
    تحديد الموقع الجغرافي من عنوان IP عبر ip-api.com (مجاني)
    
    المعاملات:
        ip: عنوان IP للمستخدم
    
    القيمة المُعادة:
        قاموس يحتوي على: country, region, city, lat, lon, isp, timezone
        أو قاموس فارغ إذا فشل البحث
    """
    if not ip or ip in ('127.0.0.1', '::1', 'غير معروف', '—', ''):
        return {}
    try:
        import requests as _req
        r = _req.get(
            f'http://ip-api.com/json/{ip}?lang=ar&fields=status,country,regionName,city,lat,lon,timezone,isp',
            timeout=3
        )
        if r.status_code == 200:
            d = r.json()
            if d.get('status') == 'success':
                return {
                    'country':  d.get('country', ''),
                    'region':   d.get('regionName', ''),
                    'city':     d.get('city', ''),
                    'lat':      d.get('lat', 0),
                    'lon':      d.get('lon', 0),
                    'isp':      d.get('isp', ''),
                    'timezone': d.get('timezone', ''),
                }
    except Exception as e:
        logger.debug(f"geo_lookup failed for {ip}: {e}")
    return {}


def build_map_url(lat: float, lon: float, zoom: int = 13) -> str:
    """
    بناء رابط خريطة Google Maps من إحداثيات GPS
    
    المعاملات:
        lat: خط العرض
        lon: خط الطول
        zoom: مستوى التكبير (افتراضي 13)
    
    القيمة المُعادة:
        رابط Google Maps
    """
    if not lat or not lon:
        return ''
    return f"https://maps.google.com/maps?q={lat},{lon}&z={zoom}"


def format_location(geo_data: dict) -> str:
    """
    تنسيق بيانات الموقع لعرضها بشكل قابل للقراءة
    
    المعاملات:
        geo_data: قاموس بيانات الموقع من geo_lookup()
    
    القيمة المُعادة:
        نص مُنسَّق للموقع
    """
    if not geo_data:
        return 'موقع غير معروف'
    parts = []
    if geo_data.get('city'):
        parts.append(geo_data['city'])
    if geo_data.get('region'):
        parts.append(geo_data['region'])
    if geo_data.get('country'):
        parts.append(geo_data['country'])
    return ' — '.join(parts) if parts else 'موقع غير معروف'


def enrich_install_record(record: dict, ip: str) -> dict:
    """
    إثراء سجل التثبيت ببيانات الموقع الجغرافي
    
    المعاملات:
        record: سجل التثبيت الحالي
        ip: عنوان IP لإجراء البحث الجغرافي
    
    القيمة المُعادة:
        سجل التثبيت مُحدَّثاً ببيانات الموقع
    """
    if not record.get('geo'):
        geo = geo_lookup(ip)
        if geo:
            record['geo'] = geo
            record['map_url'] = build_map_url(geo.get('lat', 0), geo.get('lon', 0))
            record['location_display'] = format_location(geo)
    return record
