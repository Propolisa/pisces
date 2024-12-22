<template>
  <q-layout>
    <div class="fill">

      <canvas id="canvas" ref="canvas" style="width: 100%; height: 100%;"></canvas>
    </div>
    <q-page-sticky position="top-right" :offset="[8, 8]">
      <q-select v-model="chosen_test_scene" :options="testSceneNames" style="max-width:120px" label="Scene" outlined
        dense class="sticky-select" />
    </q-page-sticky>

  </q-layout>
</template>

<script lang="ts">

import TEST_SCENES from "../modules/testbed/index.ts"

import { ref, onMounted } from 'vue'
import { Game } from "../modules/game.ts"
import { Scene, WebGPUEngine } from "@babylonjs/core"
export default {
  name: 'Game',
  computed: {
    testSceneNames() {
      return Object.keys(TEST_SCENES)
    },
  },
  data() {
    return {
      chosen_test_scene: null,
      count: 0, // Initialize count variable
    }
  },
  async mounted() {
    const canvas = this.$refs.canvas
    this.canvas = canvas
    await this.resetBabylon()
    // this.chosen_test_scene = "water"
    console.log('Canvas mounted:', canvas)
    this.GAME = new Game(canvas, true)
  },
  watch:
  {
    chosen_test_scene: {
      handler: async function (n, o) {
        await this.resetBabylon()
        TEST_SCENES[n]({ engine: this.engine, canvas: this.canvas, scene: this.scene })
      }, immediate: false
    }

  },
  methods: {
    async resetBabylon() {

      this.engine?.dispose()
      this.scene?.dispose()
      this.engine = new WebGPUEngine(canvas, { antialias: true })
      await this.engine.initAsync()
      this.scene = new Scene(this.engine)
    }
  }
}
</script>

<style scoped>
.fill {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}
</style>
