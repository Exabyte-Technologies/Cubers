import { AppState, PermissionsAndroid, Platform } from "react-native";
import {
  BleManager,
  State,
  type Device,
  type Characteristic,
} from "react-native-ble-plx";
import {
  SMART_PROFILES,
  smartCandidate,
  smartBytes,
  smartBase64,
  ganAdvertisementAddress,
  smartDeviceCatalogue,
  type SmartModel,
  type SmartTransport,
  type GattChannel,
} from "@cubers/core";
import type {
  SmartRadio,
  SmartCandidate,
  SmartConnection,
} from "./radio.types";
export type {
  SmartRadio,
  SmartCandidate,
  SmartConnection,
} from "./radio.types";
const key = (c: GattChannel) =>
  c.service.toLowerCase() + "/" + c.characteristic.toLowerCase();
async function bounded<T>(
  task: Promise<T>,
  cancel: () => void,
  ms = 5000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel();
          reject(new Error("Bluetooth operation timed out"));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
class NativeTransport implements SmartTransport {
  private closed = false;
  private next = 0;
  private transactions = new Set<string>();
  private cancellations = new Set<() => void>();
  constructor(
    private manager: BleManager,
    private id: string,
    private channels: Map<string, Characteristic>,
  ) {}
  async has(channel: GattChannel) {
    return !this.closed && this.channels.has(key(channel));
  }
  private characteristic(channel: GattChannel) {
    const found = this.channels.get(key(channel));
    if (this.closed || !found) throw new Error("Bluetooth service unavailable");
    return found;
  }
  private async operation<T>(task: (transaction: string) => Promise<T>) {
    if (this.closed) throw new Error("Device disconnected");
    const transaction = "cubers-" + ++this.next;
    this.transactions.add(transaction);
    try {
      const result = await bounded(task(transaction), () => {
        void this.manager.cancelTransaction(transaction).catch(() => {});
      });
      if (this.closed) throw new Error("Device disconnected");
      return result;
    } finally {
      this.transactions.delete(transaction);
    }
  }
  async read(channel: GattChannel) {
    if (!this.characteristic(channel).isReadable)
      throw new Error("Position is not readable");
    const value = await this.operation((t) =>
      this.manager.readCharacteristicForDevice(
        this.id,
        channel.service,
        channel.characteristic,
        t,
      ),
    );
    return smartBytes(value.value || "");
  }
  async write(channel: GattChannel, bytes: Uint8Array) {
    const characteristic = this.characteristic(channel),
      value = smartBase64(bytes);
    if (characteristic.isWritableWithResponse)
      await this.operation((t) =>
        this.manager.writeCharacteristicWithResponseForDevice(
          this.id,
          channel.service,
          channel.characteristic,
          value,
          t,
        ),
      );
    else if (characteristic.isWritableWithoutResponse)
      await this.operation((t) =>
        this.manager.writeCharacteristicWithoutResponseForDevice(
          this.id,
          channel.service,
          channel.characteristic,
          value,
          t,
        ),
      );
    else throw new Error("Device command is not writable");
  }
  async subscribe(
    channel: GattChannel,
    bytes: (v: Uint8Array) => void,
    error: () => void,
  ) {
    const characteristic = this.characteristic(channel);
    if (!characteristic.isNotifiable && !characteristic.isIndicatable)
      throw new Error("Device notifications unavailable");
    const transaction = "cubers-monitor-" + ++this.next;
    const sub = this.manager.monitorCharacteristicForDevice(
      this.id,
      channel.service,
      channel.characteristic,
      (err, value) => {
        if (this.closed) return;
        if (err) {
          error();
          return;
        }
        try {
          bytes(smartBytes(value?.value || ""));
        } catch {
          error();
        }
      },
      transaction,
    );
    const cancel = () => {
      this.cancellations.delete(cancel);
      sub.remove();
    };
    this.cancellations.add(cancel);
    if (this.closed) cancel();
    return cancel;
  }
  onDisconnect(callback: () => void) {
    const sub = this.manager.onDeviceDisconnected(this.id, () => {
      if (!this.closed) callback();
    });
    const cancel = () => {
      this.cancellations.delete(cancel);
      sub.remove();
    };
    this.cancellations.add(cancel);
    return cancel;
  }
  async disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const cancel of [...this.cancellations]) {
      try {
        cancel();
      } catch {}
    }
    for (const t of this.transactions)
      void this.manager.cancelTransaction(t).catch(() => {});
    this.transactions.clear();
    this.channels.clear();
    await bounded(this.manager.cancelDeviceConnection(this.id), () => {}).catch(
      () => {},
    );
    this.id = "";
  }
}
class NativeRadio implements SmartRadio {
  private manager = new BleManager();
  private closed = false;
  private epoch = 0;
  private candidates = new Map<string, Device>();
  private stop?: () => void;
  private pending = new Set<string>();
  private transports = new Set<NativeTransport>();
  private readinessCancel?: () => void;
  private lifecycle = AppState.addEventListener("change", (state) => {
    if (state !== "active") void this.close();
  });
  private active() {
    if (this.closed || AppState.currentState !== "active")
      throw new Error("Keep Cubers open to use Bluetooth");
  }
  private async permission() {
    this.active();
    if (Platform.OS === "android") {
      const permissions =
        Number(Platform.Version) >= 31
          ? [
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            ]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const results = await PermissionsAndroid.requestMultiple(permissions);
      if (
        permissions.some(
          (p) => results[p] !== PermissionsAndroid.RESULTS.GRANTED,
        )
      )
        throw new Error("Bluetooth permission was denied");
    }
    this.active();
    let state = await bounded(this.manager.state(), () => {});
    if (state === State.Unknown || state === State.Resetting) {
      let cancel = () => {};
      try {
        const task = new Promise<State>((resolve) => {
          const subscription = this.manager.onStateChange((value) => {
            if (value !== State.Unknown && value !== State.Resetting)
              resolve(value);
          }, true);
          cancel = () => subscription.remove();
          this.readinessCancel = cancel;
        });
        state = await bounded(task, cancel);
      } finally {
        cancel();
        if (this.readinessCancel === cancel) this.readinessCancel = undefined;
      }
    }
    this.active();
    if (state !== State.PoweredOn)
      throw new Error("Turn on Bluetooth in device settings");
  }
  stopScan() {
    this.epoch++;
    const stop = this.stop;
    this.stop = undefined;
    stop?.();
  }
  async scan(model: SmartModel, changed: (devices: SmartCandidate[]) => void) {
    this.stopScan();
    const epoch = this.epoch;
    await this.permission();
    if (epoch !== this.epoch) return;
    this.candidates.clear();
    changed([]);
    await new Promise<void>((resolve, reject) => {
      let ended = false;
      const finish = (error?: Error) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        void this.manager.stopDeviceScan().catch(() => {});
        this.stop = undefined;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => finish(), 10000);
      this.stop = () => finish();
      void this.manager
        .startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
          if (ended || this.closed || epoch !== this.epoch) return;
          if (error) {
            finish(
              new Error(
                "Bluetooth scan failed. Check permission and Bluetooth settings.",
              ),
            );
            return;
          }
          const name = device?.localName || device?.name || "";
          if (
            !device ||
            !smartCandidate(model, name) ||
            (!this.candidates.has(device.id) && this.candidates.size >= 32)
          )
            return;
          this.candidates.set(device.id, device);
          changed(
            [...this.candidates.values()].map((d) => ({
              id: d.id,
              name: d.localName || d.name || "",
            })),
          );
        })
        .catch(() => finish(new Error("Bluetooth scan could not start")));
    });
  }
  async connect(id: string, model: SmartModel): Promise<SmartConnection> {
    this.active();
    this.stopScan();
    const candidate = this.candidates.get(id);
    if (
      !candidate ||
      !smartCandidate(model, candidate.localName || candidate.name || "")
    )
      throw new Error("Scan again and select your cube");
    const epoch = this.epoch,
      profile = SMART_PROFILES[model];
    let address: string | undefined;
    if (model === "gan-356-i3") {
      if (
        Platform.OS === "android" &&
        /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(id)
      )
        address = id;
      else if (candidate.manufacturerData) {
        try {
          address = ganAdvertisementAddress(
            smartBytes(candidate.manufacturerData),
          );
        } catch {}
      }
    }
    this.pending.add(id);
    const cancel = () => {
      void this.manager.cancelDeviceConnection(id).catch(() => {});
    };
    try {
      await bounded(
        this.manager.connectToDevice(id, { timeout: 10000 }),
        cancel,
        10000,
      );
      this.active();
      if (epoch !== this.epoch) throw new Error("Device selection changed");
      const transaction = "cubers-discover";
      await bounded(
        this.manager.discoverAllServicesAndCharacteristicsForDevice(
          id,
          transaction,
        ),
        () => {
          void this.manager.cancelTransaction(transaction).catch(() => {});
          cancel();
        },
      );
      const channels = new Map<string, Characteristic>();
      for (const service of new Set(
        [
          profile.state.service,
          profile.command?.service,
          profile.battery?.notify.service,
        ].filter((s): s is string => !!s),
      )) {
        const entries = await bounded(
          this.manager.characteristicsForDevice(id, service),
          cancel,
        ).catch((error) => {
          if (service === profile.battery?.notify.service) return [];
          throw error;
        });
        for (const c of entries)
          channels.set(key({ service, characteristic: c.uuid }), c);
      }
      this.active();
      if (epoch !== this.epoch) throw new Error("Device selection changed");
      if (
        !channels.has(key(profile.state)) ||
        (profile.command && !channels.has(key(profile.command)))
      )
        throw new Error("This cube does not expose the selected protocol");
      const transport = new NativeTransport(this.manager, id, channels);
      this.transports.add(transport);
      this.candidates.clear();
      return { transport, address };
    } catch (error) {
      cancel();
      throw error;
    } finally {
      this.pending.delete(id);
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.readinessCancel?.();
    this.readinessCancel = undefined;
    this.stopScan();
    this.lifecycle.remove();
    this.candidates.clear();
    for (const id of this.pending)
      void this.manager.cancelDeviceConnection(id).catch(() => {});
    this.pending.clear();
    await Promise.allSettled([...this.transports].map((t) => t.disconnect()));
    this.transports.clear();
    await bounded(this.manager.destroy(), () => {}).catch(() => {});
  }
}
export function createSmartRadio(): SmartRadio {
  if (!__DEV__ || Platform.OS === "web")
    throw new Error(
      "Smart-cube hardware testing is available only in native development builds",
    );
  return new NativeRadio();
}
export function createSmartLessonRadio(model: SmartModel): SmartRadio {
  const entry = smartDeviceCatalogue().find((row) => row.id === model);
  if (
    !entry?.enabled ||
    !entry.physicallyTested ||
    !entry.learningEnabled ||
    !(Platform.OS === "ios" || Platform.OS === "android") ||
    !entry.learningPlatforms.includes(Platform.OS)
  )
    throw new Error("Smart lesson hardware and platform acceptance is pending");
  return new NativeRadio();
}
export function createSmartPlayRadio(model: SmartModel): SmartRadio {
  const entry = smartDeviceCatalogue().find((row) => row.id === model);
  if (
    !entry?.enabled ||
    !entry.physicallyTested ||
    !entry.playEnabled ||
    !(Platform.OS === "ios" || Platform.OS === "android") ||
    !entry.playPlatforms.includes(Platform.OS)
  )
    throw new Error("Smart play hardware and platform acceptance is pending");
  return new NativeRadio();
}
