# nylas-proxy.py
# Este script se ejecuta dentro del Sandbox de E2B para "proteger" el SDK de Nylas

import os

class ReadOnlyNylasError(Exception):
    """Error lanzado cuando se intenta realizar una operación de escritura en Nylas."""
    pass

def setup_readonly_nylas(api_key=None, grant_id=None):
    try:
        from nylas import Client
        
        # Guardar el constructor original
        _OriginalClient = Client
        
        class ProtectedClient(_OriginalClient):
            def __init__(self, api_key=api_key, api_uri=None, *args, **kwargs):
                # Forzar el uso de la API Key inyectada si no se provee una
                final_api_key = api_key or os.environ.get('NYLAS_API_KEY')
                super().__init__(api_key=final_api_key, api_uri=api_uri, *args, **kwargs)
                self._disable_write_methods()
                
                # Inyectar el grant_id por defecto si está disponible para facilitar el uso a Monica
                if grant_id:
                    print(f"[Paytony] Default Grant ID set: {grant_id[:8]}...")
                    self.default_grant_id = grant_id

            def _disable_write_methods(self):
                # Lista de objetos y sus métodos a bloquear
                to_block = [
                    ('messages', ['send', 'create', 'update', 'delete', 'stop_tracking']),
                    ('drafts', ['send', 'create', 'update', 'delete']),
                    ('events', ['create', 'update', 'delete', 'import_events']),
                    ('calendars', ['create', 'update', 'delete']),
                    ('folders', ['create', 'update', 'delete']),
                    ('webhooks', ['create', 'update', 'delete', 'rotate_secret']),
                    ('grants', ['create', 'update', 'delete']),
                ]
                
                def blocked_method(*args, **kwargs):
                    raise ReadOnlyNylasError("🚫 SEGURIDAD: Operación de ESCRITURA bloqueada. Monica solo tiene permisos de LECTURA para proteger contra exfiltración de datos.")

                for attr_name, methods in to_block:
                    obj = getattr(self, attr_name, None)
                    if obj:
                        for method in methods:
                            if hasattr(obj, method):
                                setattr(obj, method, blocked_method)

        # Reemplazar el cliente en el scope global de nylas
        import nylas
        nylas.Client = ProtectedClient
        
        # Exponer variables útiles en el sandbox
        if grant_id:
            os.environ['NYLAS_DEFAULT_GRANT_ID'] = grant_id
            
        print("[Paytony Security] Nylas SDK initialized in Secure Read-Only mode.")
        
    except ImportError:
        print("[Paytony Warning] Nylas SDK (nylas) not found in sandbox. Install it with: pip install nylas")

if __name__ == "__main__":
    setup_readonly_nylas()
