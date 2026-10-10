import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
import { expect, test } from 'vitest'

const source = name => readFileSync(new URL(`../components/${name}.vue`, import.meta.url), 'utf8')

test('all help-enabled tiles compile', () => {
  for (const name of [
    'ui/HelpToggle', 'ui/HelpText', 'ui/InfoHelp', 'ui/NumberField', 'ui/StepCard', 'ui/SectionTitle', 'EnergyFlowChart',
    'inputs/LocationStep', 'inputs/ConsumptionStep', 'inputs/CostsStep', 'inputs/LoadsStep',
    'inputs/AdvancedSettings', 'results/BatteryStepsCard', 'results/PriceSensitivityCard',
    'results/ConsumersCard', 'results/KpiGrid', 'results/EmptyState', 'results/ResultsView',
  ]) {
    const { descriptor, errors } = parse(source(name))
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: name })
    expect(compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name,
      compilerOptions: { bindingMetadata: script.bindings } }).errors).toEqual([])
  }
})

function load(name, dependencies = {}) {
  const { descriptor } = parse(source(name))
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true }).content
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"]/g,
      (_, names) => `const {${names.replace(/\s+as\s+/g, ':')}} = Vue`)
    .replace(/import\s+\{[^}]+\}\s+from\s+['"]lucide-vue-next['"]/g,
      'const CircleHelp = { render: () => null }; const Info = { render: () => null }')
    .replace(/import\s+(\w+)\s+from\s+['"][^'"]+['"]/g,
      (_, name) => `const ${name} = dependencies.${name}`)
    .replace('export default', 'return')
  return new Function('Vue', 'dependencies', compiled)(Vue, dependencies)
}

const renderer = Vue.createRenderer({
  createElement: type => ({ type, children: [], props: {} }),
  createText: text => ({ text }), createComment: text => ({ text }),
  insert(child, parent) { child.parent = parent; parent.children.push(child) },
  remove(child) {
    const siblings = child.parent?.children
    if (siblings) siblings.splice(siblings.indexOf(child), 1)
  },
  setText(node, text) { node.text = text }, setElementText(node, text) { node.text = text },
  patchProp(node, key, previous, value) { node.props[key] = value },
  parentNode: node => node.parent, nextSibling: () => null,
})

test('help buttons are independently controlled, keyboard-accessible and prevent disclosure clicks', async () => {
  const HelpToggle = load('ui/HelpToggle')
  const first = Vue.ref(false)
  const second = Vue.ref(false)
  const instances = []
  const app = renderer.createApp({ render: () => Vue.h('div', [first, second].map((state, index) =>
    Vue.h(HelpToggle, { modelValue: state.value, controls: `help-${index}`,
      ref: vm => { instances[index] = vm }, 'onUpdate:modelValue': value => { state.value = value } }))) })
  app.mount({ children: [] })
  try {
    const button = () => instances[0].$.subTree
    expect(button().type).toBe('button')
    expect(button().props['aria-expanded']).toBe(false)
    expect(button().props['aria-controls']).toBe('help-0')
    let stopped = false
    let prevented = false
    button().props.onClick({ stopPropagation() { stopped = true }, preventDefault() { prevented = true } })
    await Vue.nextTick()
    expect(first.value).toBe(true)
    expect(second.value).toBe(false)
    expect(stopped && prevented).toBe(true)
    expect(button().props['aria-expanded']).toBe(true)
    expect(button().props['aria-label']).toBe('Hilfe ausblenden')
    button().props.onClick({ stopPropagation() {}, preventDefault() {} })
    await Vue.nextTick()
    expect(first.value).toBe(false)
  } finally { app.unmount() }
})

test('help text is absent until its enclosing tile opens help', async () => {
  const HelpText = load('ui/HelpText')
  const visible = Vue.ref(false)
  let instance
  const app = renderer.createApp({
    setup() { Vue.provide('tileHelpVisible', visible) },
    render: () => Vue.h(HelpText, { ref: vm => { instance = vm } }, () => 'Explanation'),
  })
  app.mount({ children: [] })
  try {
    expect(instance.$.subTree.type).toBe(Vue.Comment)
    visible.value = true
    await Vue.nextTick()
    expect(instance.$.subTree.type).toBe('div')
    visible.value = false
    await Vue.nextTick()
    expect(instance.$.subTree.type).toBe(Vue.Comment)
  } finally { app.unmount() }
})

test('number field info tooltips pin independent help below their inputs', async () => {
  const InfoHelp = load('ui/InfoHelp')
  const NumberField = load('ui/NumberField', { InfoHelp })
  const instances = []
  const emitted = []
  const app = renderer.createApp({ render: () => Vue.h('div', [true, true, false].map((expandableHint, index) =>
    Vue.h(NumberField, { label: `Feld ${index}`, hint: `Erklärung ${index}`, expandableHint,
      modelValue: 1000, factor: 0.001, ref: vm => { instances[index] = vm },
      'onUpdate:modelValue': value => emitted.push(value) }))) })
  app.mount({ children: [] })
  const find = (node, predicate) => {
    if (predicate(node)) return node
    for (const child of node.children || []) {
      const match = find(child, predicate)
      if (match) return match
    }
  }
  const root = index => instances[index].$.subTree.el
  const button = index => find(root(index), node => node.type === 'button')
  try {
    expect(button(0).props.title).toBe('Erklärung 0')
    expect(button(0).props['aria-expanded']).toBe(false)
    expect(button(2)).toBeUndefined()
    expect(button(0).props['aria-controls']).not.toBe(button(1).props['aria-controls'])
    let stopped = false
    let prevented = false
    button(0).props.onClick({ stopPropagation() { stopped = true }, preventDefault() { prevented = true } })
    await Vue.nextTick()
    expect(stopped && prevented).toBe(true)
    expect(button(0).props['aria-expanded']).toBe(true)
    expect(button(1).props['aria-expanded']).toBe(false)
    const id = button(0).props['aria-controls']
    expect(find(find(root(0), node => node.props?.id === id), node => node.text === 'Erklärung 0')).toBeDefined()
    const input = find(root(0), node => node.type === 'input')
    expect(input.props['aria-describedby']).toBe(id)
    expect(input.props.value).toBe(1)
    input.props.onInput({ target: { valueAsNumber: 2 } })
    expect(emitted).toEqual([2000])
    button(0).props.onClick({ stopPropagation() {}, preventDefault() {} })
    await Vue.nextTick()
    expect(button(0).props['aria-expanded']).toBe(false)
    expect(find(root(0), node => node.props?.id === id)).toBeUndefined()
  } finally { app.unmount() }
})

test('expert settings use only individual info help', () => {
  const settings = source('inputs/AdvancedSettings')
  expect(settings).not.toContain('HelpToggle')
  expect(settings).not.toContain('HelpText')
  expect(settings).not.toContain('tileHelpVisible')
  expect(settings).toContain(':hint="baseloadHint"')
  expect(settings).toContain(':hint="sigmaHint"')
})