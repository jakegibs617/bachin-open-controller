# Compatibility And Legal Notes

## Clean-Room Position

This project should be implemented from public protocols, user-owned hardware
behavior, and original code. It should not copy proprietary Bachin app code,
resources, language files, handwriting libraries, binary data formats, icons, or
installer content.

## Acceptable Inputs

- Public GRBL documentation and behavior.
- User-provided machine settings from their own device.
- Original SVG/DXF/text/image import implementations or permissively licensed
  libraries.
- Original UI design and documentation.

## Avoid

- Decompiling or patching `Bachin.exe`.
- Copying app strings, layouts, icons, handwriting data, bundled images, or
  proprietary file formats.
- Claiming to be an official Bachin product.
- Shipping vendor drivers unless redistribution terms are clear.

## Naming

Use a neutral project name before publishing. "Bachin Open Controller" is a
working local name because the target hardware context is clear, but a public
release may want a less vendor-specific name.

## Compatibility Strategy

Support the hardware and GRBL workflow, not the proprietary application format.
If import from Bachin-specific project files is ever requested, treat it as a
separate legal and technical review item.

