<script>
import { noteComputed, noteMethods } from '../../injectors'

export default {
  data() {
    return {
      isActive: false
    }
  },
  computed: {
    ...noteComputed
  },
  watch: {
    isInitialized(isInitialized) {
      if (isInitialized) {
        this.checkExistAccount()
      }
    },
    isHighlightedNoteAccount: {
      handler(value) {
        if (value) {
          this.scrollOnHiglight()
        }
      },
      immediate: true
    }
  },
  created() {
    this.checkExistAccount()
  },
  methods: {
    ...noteMethods,
    scrollOnHiglight() {
      setTimeout(() => {
        this.isActive = true
        this.$refs.note.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
      }, 100)

      setTimeout(() => {
        this.isActive = false
        this.highlightNoteAccount({ isHighlighted: false })
      }, 1000)
    }
  }
}
</script>
