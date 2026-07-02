# Reserva de materiales

Web app para generar reservas de materiales compatibles con el proceso de RPS.

## Puesta en marcha (desarrollo)

```bash
pnpm install        # instalar dependencias
pnpm build          # compilar el frontend con Vite
pnpm dev            # arrancar el servidor Express (node src/server.js)
```

Copia `.env.example` a `.env` y rellena los valores antes de arrancar.

---

## Despliegue en producción con PM2

### 1. Prerrequisitos en el servidor IT

```bash
# Node.js ≥ 20 LTS ya instalado
npm install -g pm2
npm install -g pnpm   # si no está disponible
```

### 2. Preparar la aplicación

```bash
# En el directorio del proyecto:
pnpm install --frozen-lockfile   # instala solo lo que está en el lockfile
pnpm build                        # genera dist/ con el frontend compilado
```

### 3. Configurar `.env`

```env
PORT=4200
DB_SERVER=192.168.0.124
DB_PORT=1433
DB_USER=lectura
DB_PASSWORD=lectura
DB_DATABASE=RPSNext
DB_COMPANY=001
EXPORT_DIRECTORY=/mnt/oftecnica/Oficina Tecnica/VARIOS/SUBIDA DE MATERIALES
ORDER_ARCHIVE_ROOT=/mnt/oftecnica/Oficina Tecnica
```

### 4. Arrancar con PM2

```bash
pm2 start src/server.js --name materiales-ot
```

O usando el script `start` de `package.json`:

```bash
pm2 start npm --name materiales-ot -- run start
```

### 5. Comandos útiles de PM2

| Acción | Comando |
|--------|---------|
| Ver estado | `pm2 status` |
| Ver logs en vivo | `pm2 logs materiales-ot` |
| Reiniciar | `pm2 restart materiales-ot` |
| Parar | `pm2 stop materiales-ot` |
| Eliminar proceso | `pm2 delete materiales-ot` |

### 6. Arranque automático al reiniciar el sistema

```bash
pm2 startup          # genera el comando systemd/init — ejecútalo como indica la salida
pm2 save             # guarda la lista de procesos activos
```

Con esto PM2 relanzará `materiales-ot` automáticamente si el servidor se reinicia.

### 7. Actualizar la aplicación

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart materiales-ot
```

---

## Guardado en carpetas de red

En Windows se puede configurar una ruta UNC directamente:

```env
EXPORT_DIRECTORY=\\192.168.0.128\Oftecnica\Oficina Tecnica\VARIOS\SUBIDA DE MATERIALES
ORDER_ARCHIVE_ROOT=\\192.168.0.128\Oftecnica\Oficina Tecnica
```

En Linux no se debe poner la ruta UNC en `.env`. El servidor debe montar la carpeta compartida SMB/CIFS en una ruta local y usar esa ruta montada:

```env
EXPORT_DIRECTORY=/mnt/oftecnica/Oficina Tecnica/VARIOS/SUBIDA DE MATERIALES
ORDER_ARCHIVE_ROOT=/mnt/oftecnica/Oficina Tecnica
```

Ejemplo de montaje para IT:

```bash
sudo mkdir -p /mnt/oftecnica
sudo mount -t cifs "//192.168.0.128/Oftecnica" /mnt/oftecnica \
  -o username=USUARIO,password=PASSWORD,iocharset=utf8,file_mode=0664,dir_mode=0775
```

Para producción conviene dejarlo en `/etc/fstab` o en una unidad `systemd` con reconexión automática. El usuario que ejecuta Node debe poder crear y sobrescribir archivos en esas carpetas.

La app avisa en `/api/health` y bloquea el guardado si se configura una ruta UNC de Windows estando en Linux.
