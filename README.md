# Reserva de materiales

Web app para generar reservas de materiales compatibles con el proceso de RPS.

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
sudo mount -t cifs "//192.168.0.128/Oftecnica" /mnt/oftecnica -o username=USUARIO,password=PASSWORD,iocharset=utf8,file_mode=0664,dir_mode=0775
```

Para produccion conviene dejarlo en `/etc/fstab` o en una unidad `systemd` con reconexion automatica. El usuario que ejecuta Node debe poder crear y sobrescribir archivos en esas carpetas.

La app avisa en `/api/health` y bloquea el guardado si se configura una ruta UNC de Windows estando en Linux.
