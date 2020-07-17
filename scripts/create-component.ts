/* eslint-disable import/no-extraneous-dependencies */
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import camelcase from 'camelcase';
import Svgo from 'svgo';

import { iconTemplate } from '../templates/icon.template';
import { SVG_EXT } from './generate';
import { ENCODING } from './constants';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export const ICON_POSTFIX = 'Icon';

const removeEmptyRect = item => {
    const isRect = item.elem === 'rect';
    const noFill = item.attrs && item.attrs.fill ? item.attrs.fill.value === 'none' : true;
    const noChilds = item.content ? item.content.length === 0 : true;

    if (isRect && noChilds && noFill) {
        item.attrs = {};
    }

    return item;
};

const optimizer = new Svgo({
    plugins: [
        { convertPathData: { noSpaceAfterFlags: false } },
        { mergePaths: { noSpaceAfterFlags: false } },
        { removeAttrs: { attrs: '(xmlns|class)' } },
        { removeXMLNS: true },
        { prefixIds: true },
        { removeViewBox: false },
        { convertShapeToPath: false },
        {
            // @ts-ignore
            removeEmptyRect: {
                type: 'perItem',
                description: 'Remove empty rect',
                fn: removeEmptyRect,
            },
        },
    ],
});

const monoColorOptimizer = new Svgo({
    plugins: [{ removeAttrs: { attrs: 'fill' } }, { removeViewBox: false }],
});

const transformSvg = (svg: string): string =>
    svg
        .replace(/fill-rule/g, 'fillRule')
        .replace(/clip-rule/g, 'clipRule')
        .replace(/fill-opacity/g, 'fillOpacity')
        .replace(/xmlns:xlink/g, 'xmlnsXlink')
        .replace(/xlink:href/g, 'xlinkHref')
        .replace(/<rect\/>/g, '');

export async function createComponent(filePath: string, packageDir: string) {
    const fileContent = await readFile(filePath, ENCODING);

    const basename = path.basename(filePath, `.${SVG_EXT}`);

    const [packageName, name, size, color] = basename.split('_');

    let componentName = `${name}_${size}${color ? `_${color}` : ``}`;

    componentName = camelcase(componentName, {
        pascalCase: true,
    });

    componentName += ICON_POSTFIX;

    let { data } = await optimizer.optimize(fileContent);

    let svg = data;

    if (!color) {
        let { data } = await monoColorOptimizer.optimize(svg);
        svg = data;
    }

    svg = transformSvg(svg);

    const componentContent = iconTemplate
        .replace(/{{ComponentName}}/g, `${componentName}`)
        .replace('{{body}}', svg)
        .replace(
            '<svg',
            `<svg {...props} focusable="false" ${color ? '' : 'fill="currentColor"'}`,
        );

    const fullFileName = path.join(packageDir, `${componentName}.tsx`);

    await writeFile(fullFileName, componentContent, ENCODING);

    return componentName;
}
