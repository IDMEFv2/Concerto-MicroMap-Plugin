# Micro Map – draw.io SVG Metadata Guide

This document describes how to prepare a draw.io SVG file so that it can be used correctly in the Micro Map.

It explains **which metadata fields are required**, **what they represent**, and **how to configure simple monitored objects and camera fields of view**.

The goal is to help users prepare a valid `.drawio.svg` file without manually editing application code.

---

## Supported Upload Format

- **Upload format:** draw.io SVG
- **Recommended file extension:** `.drawio.svg`
- **Recommended editor:** draw.io / diagrams.net
- **Do not use:** plain SVG files exported without embedded draw.io data

The Micro Map expects the SVG to contain the original draw.io diagram data inside the exported SVG.  
When exporting from draw.io / diagrams.net, make sure the export option that embeds the diagram data is enabled.

In draw.io this is commonly shown as an option such as:

```
Include a copy of my diagram
```

If this option is disabled, the Micro Map may display the drawing visually, but it will not be able to read the metadata required to link alerts to objects.

---

## General Concept

A Micro Map floor plan is a draw.io diagram where some shapes contain metadata.

The visible shape is what the user sees on the map.

The metadata tells the Micro Map how that shape should behave when alerts arrive.

There are two main types of objects:

1. **Simple monitored objects**
   - Examples: computer, server, network device, rack, room, door, sensor, generic asset
   - Require only a small amount of metadata
   - Usually represent an alert target
   - Can be colored according to the alerts associated with them

2. **Camera objects with field of view**
   - Represent a physical camera and its visible area
   - Require two linked draw.io objects:
     - a **camera object**
     - a **beam object** representing the camera field of view
   - Used to display detection markers inside the camera field of view

---

## Metadata Editing in draw.io

For each monitored shape, add metadata directly to the draw.io object.

The exact UI may vary depending on the draw.io version, but the typical workflow is:

1. Select the shape.
2. Open the shape data editor, usually named **Edit Data**.
3. Add the required fields as key/value pairs.
4. Save the diagram.
5. Export the diagram as SVG with embedded draw.io data.

Metadata field names are **case-sensitive**.  
Use the exact field names shown in this guide.

For example:

```
target
type
connection
sensor_ip
marker_x_ratio
```

Do not rename them to:

```
Target
TYPE
sensorIP
marker-x-ratio
```

---

## Object Type Overview

| Object kind | Purpose | Required metadata | Optional metadata |
|---|---|---|---|
| Simple monitored object | Represents a normal asset such as a computer or server | `target` | none |
| Camera object | Represents the physical camera/sensor | `type`, `target`, `connection` | `sensor_id`, `sensor_ip`, `sensor_name`, `sensor_hostname`, `sensor_location`, `sensor_geolocation` |
| Beam object | Represents the camera field of view | `type`, `connection` | `beam_id`, `location`, `fallback_position`, `marker_x_ratio`, `marker_y_ratio`, `azimuth_deg`, `horizontal_fov_deg`, `vertical_fov_deg`, `range_m` |

---

## Simple Monitored Object

A simple monitored object is the easiest object to configure.

Use it for assets such as:

- desktop computers
- servers
- network devices
- racks
- rooms
- doors
- other fixed assets

A simple object only needs one metadata field:

```
target
```

### Example

```
target = 10.0.1.15
```

This means that alerts referring to `10.0.1.15` can be associated with this object.

When matching alerts are found, the object can be colored according to the configured alert rules and can display alert information in the tooltip.

### Simple Object Fields

### target
- **Required:** Yes
- **Description:** Identifier used to match alerts to this object
- **Type:** Text
- **Recommended values:**
  - IP address
  - hostname
  - asset identifier
- **Rules:**
  - Must match the identifier used by the alerting system
  - Should be unique within the floor plan when possible
  - Should not contain unnecessary spaces

**Example:**

```
target = 10.0.1.15
```

---

## Camera with Field of View

A camera is more complex than a simple object because it is composed of two linked draw.io objects.

You must create:

1. A **camera object**
2. A **beam object**

The camera object represents the physical sensor.  
The beam object represents the area where detections from that camera should be displayed.

The two objects are linked using the same `connection` value.

---

## Camera Object

The camera object should be the visible camera icon or shape.

It identifies the physical camera that generated the alert.

### Minimum Camera Metadata

```
type = camera
target = 10.0.1.30
connection = cam-east-01
```

### Recommended Camera Metadata

```
type = camera
target = 10.0.1.30
connection = cam-east-01
sensor_id = 0a08d1ef-27e8-48cc-8bff-57fe6d6cfb41
sensor_ip = 10.0.1.30
sensor_name = cam-east-01
sensor_hostname = cam-east-01.local
sensor_location = office-room-east-corridor
sensor_geolocation = 41.924015, 9.406020
```

### Camera Field Details

### type
- **Required:** Yes for camera objects
- **Description:** Defines the object as a camera
- **Type:** Text
- **Allowed value:**

```
camera
```

---

### target
- **Required:** Yes
- **Description:** Main identifier used to associate alerts with the camera
- **Type:** Text
- **Recommended value:** camera IP address
- **Rules:**
  - Should match the camera-related value used in alerts
  - In most cases this should be the same value as `sensor_ip`
  - Also allows the camera object to behave like a monitored object

**Example:**

```
target = 10.0.1.30
```

---

### connection
- **Required:** Yes
- **Description:** Shared link between the camera object and its beam object
- **Type:** Text
- **Rules:**
  - Must be identical on the camera object and its corresponding beam object
  - Must be unique for each camera/beam pair
  - Can be a human-readable identifier

**Recommended example:**

```
connection = cam-east-01
```

The sample diagram may use the internal draw.io object ID as the connection value.  
This works, but for user-created diagrams a readable value such as `cam-east-01` is easier to maintain.

---

### sensor_id
- **Required:** No
- **Description:** Unique identifier of the physical sensor/camera
- **Type:** Text
- **Rules:**
  - Should match the sensor ID used in alerts, if available

**Example:**

```
sensor_id = 0a08d1ef-27e8-48cc-8bff-57fe6d6cfb41
```

---

### sensor_ip
- **Required:** No, but strongly recommended
- **Description:** IP address of the physical sensor/camera
- **Type:** Text
- **Rules:**
  - Should match `Sensor.IP` or the equivalent camera IP in alerts
  - Usually the same value as `target`

**Example:**

```
sensor_ip = 10.0.1.30
```

---

### sensor_name
- **Required:** No, but recommended
- **Description:** Human-readable camera name
- **Type:** Text

**Example:**

```
sensor_name = cam-east-01
```

---

### sensor_hostname
- **Required:** No
- **Description:** Hostname of the camera or camera analytics device
- **Type:** Text

**Example:**

```
sensor_hostname = cam-east-01.local
```

---

### sensor_location
- **Required:** No, but recommended
- **Description:** Logical location of the camera
- **Type:** Text
- **Rules:**
  - Should use the same naming convention as alert locations when possible

**Example:**

```
sensor_location = office-room-east-corridor
```

---

### sensor_geolocation
- **Required:** No
- **Description:** Geographic position of the camera
- **Type:** Text
- **Recommended format:**

```
latitude, longitude
```

**Example:**

```
sensor_geolocation = 41.924015, 9.406020
```

---

## Beam Object

The beam object represents the camera field of view.

It can be drawn as a triangle, cone, polygon, transparent area, or any other shape that visually describes the area monitored by the camera.

The beam object is where detection markers are displayed when an alert is associated with the camera.

### Minimum Beam Metadata

```
type = beam
connection = cam-east-01
```

### Recommended Beam Metadata

```
type = beam
connection = cam-east-01
beam_id = beam-east-01
location = office-room-east-corridor
fallback_position = center
marker_x_ratio = 0.5
marker_y_ratio = 0.5
azimuth_deg = 105
horizontal_fov_deg = 70
vertical_fov_deg = 45
range_m = 18
```

### Beam Field Details

### type
- **Required:** Yes for beam objects
- **Description:** Defines the object as a camera field-of-view beam
- **Type:** Text
- **Allowed value:**

```
beam
```

---

### connection
- **Required:** Yes
- **Description:** Shared link between the beam object and its camera object
- **Type:** Text
- **Rules:**
  - Must be identical to the `connection` value of the camera object
  - Must be unique for each camera/beam pair

**Example:**

```
connection = cam-east-01
```

---

### beam_id
- **Required:** No, but recommended
- **Description:** Human-readable identifier for the beam
- **Type:** Text
- **Rules:**
  - Should be unique within the floor plan
  - Useful for maintenance and troubleshooting

**Example:**

```
beam_id = beam-east-01
```

---

### location
- **Required:** No, but recommended
- **Description:** Logical location covered by the beam
- **Type:** Text

**Example:**

```
location = office-room-east-corridor
```

---

### fallback_position
- **Required:** No
- **Description:** Describes the fallback placement strategy for detection markers
- **Type:** Text
- **Currently recommended value:**

```
center
```

If the system cannot compute a more precise detection position, it places the marker using the beam shape and the marker ratio values.

---

### marker_x_ratio
- **Required:** No
- **Description:** Horizontal marker position inside the beam bounding area
- **Type:** Decimal number
- **Default value:** `0.5`
- **Valid range:** `0` to `1`
- **Rules:**
  - `0` means left side of the beam bounding area
  - `0.5` means horizontal center
  - `1` means right side of the beam bounding area

**Example:**

```
marker_x_ratio = 0.5
```

---

### marker_y_ratio
- **Required:** No
- **Description:** Vertical marker position inside the beam bounding area
- **Type:** Decimal number
- **Default value:** `0.5`
- **Valid range:** `0` to `1`
- **Rules:**
  - `0` means top of the beam bounding area
  - `0.5` means vertical center
  - `1` means bottom of the beam bounding area

**Example:**

```
marker_y_ratio = 0.5
```

---

### azimuth_deg
- **Required:** No
- **Description:** Horizontal direction of the camera field of view, expressed in degrees
- **Type:** Number
- **Recommended range:** `0` to `360`
- **Note:** This value is useful for documentation and future advanced positioning. The current visual placement primarily relies on the beam shape and marker ratios.

**Example:**

```
azimuth_deg = 105
```

---

### horizontal_fov_deg
- **Required:** No
- **Description:** Horizontal field of view of the camera, expressed in degrees
- **Type:** Number
- **Recommended range:** greater than `0`, usually less than or equal to `180`

**Example:**

```
horizontal_fov_deg = 70
```

---

### vertical_fov_deg
- **Required:** No
- **Description:** Vertical field of view of the camera, expressed in degrees
- **Type:** Number
- **Recommended range:** greater than `0`, usually less than or equal to `180`

**Example:**

```
vertical_fov_deg = 45
```

---

### range_m
- **Required:** No
- **Description:** Approximate detection range of the camera in meters
- **Type:** Number
- **Recommended range:** greater than `0`

**Example:**

```
range_m = 18
```

---

## How Camera Detection Markers Are Placed

When a camera-related alert is received, the Micro Map follows this logic:

1. It tries to identify the camera using alert fields such as:
   - sensor IP
   - target IP
   - sensor hostname
   - sensor name
   - sensor ID
2. It finds the camera object in the draw.io SVG.
3. It reads the camera object's `connection` value.
4. It finds the beam object with the same `connection` value.
5. It places the detection marker inside the beam.

If more than one marker would be placed at the same position, the Micro Map automatically applies a small offset so that the markers do not fully overlap.

---

## Icon Selection for Detection Markers

Detection marker icons are selected from the alert source category.

Current behavior:

| Alert source category | Marker icon |
|---|---|
| `Object.LivingBeings.Human` | Human icon |
| Any other category | Generic fallback icon |

This means that a human detection alert displays a human icon, while an unknown or unclassified object displays the generic icon.

---

## Complete Examples

## Example 1 – Simple Computer

Use this for a normal computer or workstation.

```
target = 10.0.1.15
```

This object can be colored according to alerts targeting `10.0.1.15`.

---

## Example 2 – Simple Server

Use this for a server or rack asset.

```
target = 172.16.0.20
```

---

## Example 3 – Camera and Beam Pair

### Camera object metadata

```
type = camera
target = 10.0.1.30
connection = cam-east-01
sensor_id = 0a08d1ef-27e8-48cc-8bff-57fe6d6cfb41
sensor_ip = 10.0.1.30
sensor_name = cam-east-01
sensor_hostname = cam-east-01.local
sensor_location = office-room-east-corridor
sensor_geolocation = 41.924015, 9.406020
```

### Beam object metadata

```
type = beam
connection = cam-east-01
beam_id = beam-east-01
location = office-room-east-corridor
fallback_position = center
marker_x_ratio = 0.5
marker_y_ratio = 0.5
azimuth_deg = 105
horizontal_fov_deg = 70
vertical_fov_deg = 45
range_m = 18
```

The `connection` value is the link between the camera and the beam.

Both objects must use exactly the same value:

```
connection = cam-east-01
```

---

## Recommended Naming Conventions

Use simple, stable, readable values.

Recommended examples:

```
cam-east-01
beam-east-01
office-room-east-corridor
10.0.1.30
```

Avoid values that are hard to maintain:

```
Camera 1!!!
East Camera (temporary)
copy of copy of beam
```

For locations, use the same naming convention in:

- draw.io metadata
- alert `Sensor.Location`
- alert `Source.Location`
- alert `Target.Location`

This makes troubleshooting much easier.

---

## Valid Values Summary

| Field | Object kind | Required | Type | Valid values / rules |
|---|---|---:|---|---|
| `target` | Simple object, camera | Yes | Text | Alert-matching identifier, usually IP or hostname |
| `type` | Camera | Yes | Text | `camera` |
| `type` | Beam | Yes | Text | `beam` |
| `connection` | Camera, beam | Yes | Text | Same value on camera and beam |
| `sensor_id` | Camera | No | Text | Sensor identifier used in alerts |
| `sensor_ip` | Camera | No, recommended | Text | Camera IP address |
| `sensor_name` | Camera | No, recommended | Text | Camera name |
| `sensor_hostname` | Camera | No | Text | Camera hostname |
| `sensor_location` | Camera | No, recommended | Text | Logical camera location |
| `sensor_geolocation` | Camera | No | Text | `latitude, longitude` |
| `beam_id` | Beam | No, recommended | Text | Unique beam identifier |
| `location` | Beam | No, recommended | Text | Logical area covered by the beam |
| `fallback_position` | Beam | No | Text | Recommended: `center` |
| `marker_x_ratio` | Beam | No | Decimal | `0` to `1`, default `0.5` |
| `marker_y_ratio` | Beam | No | Decimal | `0` to `1`, default `0.5` |
| `azimuth_deg` | Beam | No | Number | Recommended `0` to `360` |
| `horizontal_fov_deg` | Beam | No | Number | Greater than `0` |
| `vertical_fov_deg` | Beam | No | Number | Greater than `0` |
| `range_m` | Beam | No | Number | Greater than `0` |

---

## Common Errors

### Exporting a plain SVG

If the SVG does not include embedded draw.io data, the Micro Map cannot read object metadata.

**Fix:** export the diagram as SVG with embedded draw.io data enabled.

---

### Adding metadata to the wrong object

If metadata is added to a different shape than the visible monitored object, the Micro Map may not associate alerts correctly.

**Fix:** select the exact shape that should represent the asset, camera, or beam, then edit its data.

---

### Using different connection values for camera and beam

This is one of the most common errors.

Incorrect:

```
camera connection = cam-east-01
beam connection = beam-east
```

Correct:

```
camera connection = cam-east-01
beam connection = cam-east-01
```

---

### Forgetting type on camera or beam objects

A camera/beam pair should always use:

```
type = camera
```

on the camera object, and:

```
type = beam
```

on the beam object.

---

### Using a target that does not match alerts

If a simple object has:

```
target = 10.0.1.15
```

but the alerts use a different identifier, the object will not receive the expected alert color or tooltip information.

**Fix:** check the identifier used in the alerts and use the same value in `target`.

---

### Reusing the same connection for multiple camera pairs

If two unrelated camera/beam pairs share the same `connection`, markers may be placed on the wrong beam.

**Fix:** use one unique connection value per camera/beam pair.

---

### Using uppercase or misspelled field names

Incorrect:

```
Target = 10.0.1.30
sensorIP = 10.0.1.30
marker-x-ratio = 0.5
```

Correct:

```
target = 10.0.1.30
sensor_ip = 10.0.1.30
marker_x_ratio = 0.5
```

---

### Setting marker ratios outside the valid range

Incorrect:

```
marker_x_ratio = 50
marker_y_ratio = -1
```

Correct:

```
marker_x_ratio = 0.5
marker_y_ratio = 0.5
```

---

## Recommended Checklist Before Upload

Before uploading the SVG to the Micro Map, verify that:

- The file was exported from draw.io as SVG with embedded diagram data.
- Every simple monitored object has a `target`.
- Every camera object has `type = camera`.
- Every beam object has `type = beam`.
- Each camera and its beam share the same `connection`.
- Each camera/beam pair uses a unique `connection`.
- Camera IPs or hostnames match the values used in alerts.
- Beam marker ratios are between `0` and `1`.
- Field names are lowercase and written exactly as documented.
- The file still opens correctly in draw.io after export.

---

## Minimal Templates

### Simple Object Template

```
target =
```

### Camera Object Template

```
type = camera
target =
connection =
sensor_id =
sensor_ip =
sensor_name =
sensor_hostname =
sensor_location =
sensor_geolocation =
```

### Beam Object Template

```
type = beam
connection =
beam_id =
location =
fallback_position = center
marker_x_ratio = 0.5
marker_y_ratio = 0.5
azimuth_deg =
horizontal_fov_deg =
vertical_fov_deg =
range_m =
```
