import { resolve } from "path";
import { TBitContainer } from "./TBitFileSystem";

async function main(): Promise<void> {
  const filePath = resolve(process.cwd(), "universo.tbit");
  const clave = "clave-demostracion-tbit";
  const mensaje = "Prueba T-Bit 1:1 Exitosa";

  const container = new TBitContainer(filePath);

  await container.initContainer(10);
  await container.write(clave, mensaje);

  const recuperado = await container.read(clave, Buffer.byteLength(mensaje, "utf8"));

  console.log("Archivo:", filePath);
  console.log("Mensaje recuperado:", recuperado);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
