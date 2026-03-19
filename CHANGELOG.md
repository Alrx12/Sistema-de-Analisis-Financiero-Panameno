
---

# 📄 `CHANGELOG.md`

```md
# Changelog

## v0.1.0 - Backend inicial

### Agregado
- Estructura base del proyecto
- FastAPI configurado
- Conexión a PostgreSQL
- Alembic configurado
- Tablas iniciales:
  - users
  - bank_accounts
  - uploaded_files

### Autenticación
- Registro de usuarios
- Login con JWT
- Hash de contraseñas con Argon2
- Endpoint protegido `/users/me`

### API
- Endpoint `/health`
- Integración Swagger UI
- OAuth2PasswordBearer funcional

### Infraestructura
- Configuración por variables de entorno
- Separación en módulos (api, core, models, schemas)

### Fixes
- Corrección de dependencias de seguridad (argon2)
- Ajuste de login para compatibilidad OAuth2
- Configuración correcta de Alembic