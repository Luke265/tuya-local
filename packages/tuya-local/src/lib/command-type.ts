/**
 * Human-readable definitions
 * of command bytes.
 * See also https://github.com/tuya/tuya-iotos-embeded-sdk-wifi-ble-bk7231n/blob/master/sdk/include/lan_protocol.h
 * @readonly
 * @private
 */
export type Command = keyof typeof CommandType;
export const CommandType = {
  UDP: 0,
  AP_CONFIG: 1,
  ACTIVE: 2,
  BIND: 3, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_START: 3, // Negotiate session key
  RENAME_GW: 4, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_RES: 4, // Negotiate session key response
  RENAME_DEVICE: 5, // ?? Leave in for backward compatibility
  SESS_KEY_NEG_FINISH: 5, // Finalize session key negotiation
  UNBIND: 6,
  CONTROL: 7,
  STATUS: 8,
  HEART_BEAT: 9,
  DP_QUERY: 10,
  QUERY_WIFI: 11,
  TOKEN_BIND: 12,
  CONTROL_NEW: 13,
  ENABLE_WIFI: 14,
  DP_QUERY_NEW: 16,
  SCENE_EXECUTE: 17,
  DP_REFRESH: 18, // Request refresh of DPS  UPDATEDPS / LAN_QUERY_DP
  UDP_NEW: 19,
  AP_CONFIG_NEW: 20,
  BOARDCAST_LPV34: 35,
  LAN_EXT_STREAM: 40,
  LAN_GW_ACTIVE: 240,
  LAN_SUB_DEV_REQUEST: 241,
  LAN_DELETE_SUB_DEV: 242,
  LAN_REPORT_SUB_DEV: 243,
  LAN_SCENE: 244,
  LAN_PUBLISH_CLOUD_CONFIG: 245,
  LAN_PUBLISH_APP_CONFIG: 246,
  LAN_EXPORT_APP_CONFIG: 247,
  LAN_PUBLISH_SCENE_PANEL: 248,
  LAN_REMOVE_GW: 249,
  LAN_CHECK_GW_UPDATE: 250,
  LAN_GW_UPDATE: 251,
  LAN_SET_GW_CHANNEL: 252,
} as const;

export const CommandTypeReverse = Object.fromEntries(
  Object.entries(CommandType).map(([k, v]) => [v, k]),
) as {
  [K in keyof typeof CommandType as (typeof CommandType)[K]]: K;
};
